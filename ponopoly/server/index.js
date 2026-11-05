// Po'Nopoly online server: раздаёт статику клиента и держит WebSocket-комнаты.
// Запуск: node server/index.js   (PORT=8080 по умолчанию)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { createGame, applyAction, PHASE, whoActs, EngineError } from '../js/engine.js';
import { nextBotAction, botDelay } from '../js/bot.js';
import { TOKENS, BOT_NAMES, DEFAULT_SETTINGS, PLAYER_COLORS } from '../js/data.js';

const PORT = Number(process.env.PORT) || 8080;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BOT_SPEED = Number(process.env.BOT_SPEED || 1); // множитель задержек ботов (0 — мгновенно, для тестов)
const DISCONNECT_GRACE_MS = Number(process.env.DISCONNECT_GRACE_MS || 120000);

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2' };

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/health') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, rooms: rooms.size })); return; }
  let p = decodeURIComponent(url.pathname);
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(ROOT, p));
  const rel = path.relative(ROOT, file);
  if (rel.startsWith('..') || rel.split(path.sep).some((s) => s.startsWith('.') || ['server', 'tests', 'node_modules'].includes(s))) { res.writeHead(404); res.end('not found'); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server, path: '/ws' });
const rooms = new Map();

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
function newCode() {
  for (;;) {
    let c = '';
    for (let i = 0; i < 4; i++) c += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
    if (!rooms.has(c)) return c;
  }
}
const cleanName = (n) => String(n || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 20) || 'Игрок';
const cleanToken = (t, room) => {
  const used = new Set(room ? room.players.map((p) => p.token) : []);
  if (TOKENS.some((x) => x.id === t) && !used.has(t)) return t;
  return (TOKENS.find((x) => !used.has(x.id)) || TOKENS[0]).id;
};

function send(ws, obj) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); }
function publicRoom(room) {
  return {
    code: room.code, host: room.hostId, started: !!room.state, settings: room.settings,
    players: room.players.map((p) => ({ id: p.id, name: p.name, token: p.token, bot: p.bot, color: p.color, connected: p.bot || !!(p.ws && p.ws.readyState === 1) })),
  };
}
function broadcast(room, obj) { for (const p of room.players) if (p.ws) send(p.ws, obj); }
function broadcastRoom(room) { broadcast(room, { t: 'room', room: publicRoom(room) }); }
function broadcastState(room, events) { broadcast(room, { t: 'state', state: room.state, events }); }

function touch(room) { room.lastActive = Date.now(); }

function runBots(room) {
  clearTimeout(room.botTimer);
  room.botTimer = null;
  if (!room.state || room.state.phase === PHASE.OVER) return;
  const a = nextBotAction(room.state);
  if (!a) return;
  room.botTimer = setTimeout(() => {
    room.botTimer = null;
    if (!room.state) return;
    try {
      const ev = applyAction(room.state, a);
      broadcastState(room, ev);
    } catch (e) {
      console.error('bot action failed', a, e.message);
      // чтобы игра не зависла, бот сдаётся
      try { const ev = applyAction(room.state, { type: 'surrender', pid: a.pid }); broadcastState(room, ev); } catch {}
    }
    runBots(room);
  }, botDelay(a) * BOT_SPEED);
}

function addPlayer(room, { name, token, bot, ws }) {
  room.seq += 1;
  const p = { id: `p${room.seq}`, name, token: cleanToken(token, room), bot: !!bot, ws: ws || null, secret: crypto.randomBytes(12).toString('hex'), color: PLAYER_COLORS[(room.seq - 1) % PLAYER_COLORS.length], graceTimer: null };
  room.players.push(p);
  return p;
}

function removePlayer(room, pid) {
  const i = room.players.findIndex((p) => p.id === pid);
  if (i < 0) return;
  const [p] = room.players.splice(i, 1);
  if (p.ws) { p.ws.room = null; p.ws.pid = null; }
  if (room.hostId === pid) { const h = room.players.find((q) => !q.bot); room.hostId = h ? h.id : null; }
}

// Игрок пропал во время партии — через паузу его доигрывает бот.
function botify(room, pid, why) {
  const p = room.players.find((q) => q.id === pid);
  if (!p || p.bot || !room.state) return;
  p.bot = true;
  const sp = room.state.players.find((q) => q.id === pid);
  if (sp) sp.bot = true;
  room.state.log.push({ n: room.state.log.length + 1, t: `${p.name}: ${why}. Дальше за него играет бот.`, p: pid, turn: room.state.turnNo });
  broadcastRoom(room);
  broadcastState(room, []);
  runBots(room);
}

function onDisconnect(ws) {
  const room = ws.room; const pid = ws.pid;
  if (!room) return;
  const p = room.players.find((q) => q.id === pid);
  if (!p) return;
  if (p.ws === ws) p.ws = null;
  touch(room);
  if (!room.state) {
    removePlayer(room, pid);
    if (room.players.every((q) => q.bot)) rooms.delete(room.code); else broadcastRoom(room);
    return;
  }
  broadcastRoom(room);
  clearTimeout(p.graceTimer);
  p.graceTimer = setTimeout(() => { if (!p.ws && !p.bot) botify(room, pid, 'потерял связь'); }, DISCONNECT_GRACE_MS);
}

wss.on('connection', (ws) => {
  ws.room = null; ws.pid = null;
  send(ws, { t: 'hello', version: 1 });
  ws.on('message', (raw) => {
    let msg; try { msg = JSON.parse(raw); } catch { return; }
    try { handle(ws, msg); } catch (e) {
      send(ws, { t: 'error', msg: e instanceof EngineError ? e.message : 'Ошибка сервера' });
      if (!(e instanceof EngineError)) console.error(e);
    }
  });
  ws.on('close', () => onDisconnect(ws));
  ws.on('error', () => {});
});

function requireRoom(ws) { if (!ws.room) throw new EngineError('Вы не в комнате'); return ws.room; }
function requireHost(ws) { const room = requireRoom(ws); if (room.hostId !== ws.pid) throw new EngineError('Это может только хост'); return room; }

function handle(ws, msg) {
  switch (msg.t) {
    case 'ping': send(ws, { t: 'pong' }); return;
    case 'create': {
      if (ws.room) throw new EngineError('Вы уже в комнате');
      const room = { code: newCode(), hostId: null, players: [], settings: { ...DEFAULT_SETTINGS }, state: null, seq: 0, botTimer: null, createdAt: Date.now(), lastActive: Date.now() };
      rooms.set(room.code, room);
      const p = addPlayer(room, { name: cleanName(msg.name), token: msg.token, ws });
      room.hostId = p.id; ws.room = room; ws.pid = p.id;
      send(ws, { t: 'joined', code: room.code, pid: p.id, secret: p.secret });
      broadcastRoom(room);
      return;
    }
    case 'join': {
      if (ws.room) throw new EngineError('Вы уже в комнате');
      const room = rooms.get(String(msg.code || '').toUpperCase().trim());
      if (!room) throw new EngineError('Комната не найдена');
      if (room.state) throw new EngineError('Игра уже идёт');
      if (room.players.length >= 6) throw new EngineError('Комната заполнена');
      const p = addPlayer(room, { name: cleanName(msg.name), token: msg.token, ws });
      ws.room = room; ws.pid = p.id; touch(room);
      send(ws, { t: 'joined', code: room.code, pid: p.id, secret: p.secret });
      broadcastRoom(room);
      return;
    }
    case 'rejoin': {
      const room = rooms.get(String(msg.code || '').toUpperCase());
      if (!room) throw new EngineError('Комната уже закрыта');
      const p = room.players.find((q) => q.id === msg.pid && q.secret === msg.secret);
      if (!p) throw new EngineError('Не удалось вернуться в комнату');
      if (p.ws && p.ws !== ws) { try { p.ws.close(); } catch {} }
      p.ws = ws; ws.room = room; ws.pid = p.id; touch(room);
      clearTimeout(p.graceTimer);
      if (p.bot && room.state) { // вернулся человек — забирает управление у бота
        p.bot = false; const sp = room.state.players.find((q) => q.id === p.id); if (sp) sp.bot = false;
      }
      send(ws, { t: 'joined', code: room.code, pid: p.id, secret: p.secret });
      broadcastRoom(room);
      if (room.state) send(ws, { t: 'state', state: room.state, events: [] });
      return;
    }
    case 'add_bot': {
      const room = requireHost(ws);
      if (room.state) throw new EngineError('Игра уже идёт');
      if (room.players.length >= 6) throw new EngineError('Комната заполнена');
      const used = new Set(room.players.map((p) => p.name));
      const name = BOT_NAMES.find((n) => !used.has(n)) || `Бот ${room.players.length + 1}`;
      addPlayer(room, { name, token: null, bot: true });
      broadcastRoom(room);
      return;
    }
    case 'kick': {
      const room = requireHost(ws);
      if (msg.pid === ws.pid) throw new EngineError('Себя выгнать нельзя');
      const p = room.players.find((q) => q.id === msg.pid);
      if (!p) return;
      if (room.state) { if (!p.bot) botify(room, p.id, 'отключён хостом'); return; }
      if (p.ws) { send(p.ws, { t: 'kicked' }); p.ws.room = null; p.ws.pid = null; }
      removePlayer(room, p.id);
      broadcastRoom(room);
      return;
    }
    case 'settings': {
      const room = requireHost(ws);
      if (room.state) throw new EngineError('Игра уже идёт');
      const s = msg.settings || {};
      room.settings = {
        ...room.settings,
        startCash: [1000, 1500, 2000, 2500].includes(Number(s.startCash)) ? Number(s.startCash) : room.settings.startCash,
        auctions: typeof s.auctions === 'boolean' ? s.auctions : room.settings.auctions,
        freeParkingPool: typeof s.freeParkingPool === 'boolean' ? s.freeParkingPool : room.settings.freeParkingPool,
      };
      broadcastRoom(room);
      return;
    }
    case 'start': {
      const room = requireHost(ws);
      if (room.state) throw new EngineError('Игра уже идёт');
      if (room.players.length < 2) throw new EngineError('Нужно минимум два игрока');
      room.state = createGame({ players: room.players.map((p) => ({ id: p.id, name: p.name, token: p.token, bot: p.bot, color: p.color })), settings: room.settings, seed: crypto.randomInt(2147483647) });
      room.startedAt = Date.now();
      broadcastRoom(room);
      broadcastState(room, [{ type: 'start' }]);
      runBots(room);
      return;
    }
    case 'action': {
      const room = requireRoom(ws);
      if (!room.state) throw new EngineError('Игра ещё не началась');
      const action = { ...(msg.action || {}), pid: ws.pid };
      const ev = applyAction(room.state, action);
      touch(room);
      broadcastState(room, ev);
      runBots(room);
      return;
    }
    case 'leave': {
      const room = ws.room; if (!room) return;
      const pid = ws.pid;
      ws.room = null; ws.pid = null;
      const p = room.players.find((q) => q.id === pid);
      if (!p) return;
      p.ws = null;
      if (room.state) { if (room.state.phase !== PHASE.OVER) botify(room, pid, 'вышел из игры'); }
      else { removePlayer(room, pid); if (room.players.every((q) => q.bot)) rooms.delete(room.code); else broadcastRoom(room); }
      return;
    }
    default: throw new EngineError('Неизвестная команда');
  }
}

// Уборка: комнаты без живых игроков удаляются через 15 минут, любые — через 8 часов.
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    const humansOnline = room.players.some((p) => !p.bot && p.ws && p.ws.readyState === 1);
    if ((!humansOnline && now - room.lastActive > 15 * 60 * 1000) || now - room.createdAt > 8 * 3600 * 1000) {
      clearTimeout(room.botTimer);
      for (const p of room.players) { clearTimeout(p.graceTimer); if (p.ws) { try { p.ws.close(); } catch {} } }
      rooms.delete(code);
    }
  }
}, 60 * 1000).unref();

server.listen(PORT, () => console.log(`Po'Nopoly server on http://localhost:${PORT} (ws: /ws)`));
