import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { RU } from '../js/ru.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 18090 + Math.floor(Math.random() * 100);

function startServer() {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), BOT_SPEED: '0', DISCONNECT_GRACE_MS: '300' } });
    proc.stdout.on('data', (d) => { if (String(d).includes('server on')) resolve(proc); });
    proc.stderr.on('data', (d) => console.error(String(d)));
    proc.on('exit', (c) => reject(new Error('server exited ' + c)));
    setTimeout(() => reject(new Error('server start timeout')), 8000);
  });
}

class Client {
  constructor() { this.ws = new WebSocket(`ws://localhost:${PORT}/ws`); this.inbox = []; this.waiters = []; this.ws.onmessage = (m) => { const msg = JSON.parse(m.data); this.inbox.push(msg); this.waiters = this.waiters.filter((w) => !w(msg)); }; }
  open() { return new Promise((res) => { this.ws.onopen = res; }); }
  send(o) { this.ws.send(JSON.stringify(o)); }
  next(pred, ms = 4000) {
    return new Promise((res, rej) => {
      const i = this.inbox.findIndex(pred);
      if (i >= 0) { const [m] = this.inbox.splice(i, 1); res(m); return; }
      const to = setTimeout(() => rej(new Error('timeout waiting for message')), ms);
      this.waiters.push((msg) => { if (pred(msg)) { clearTimeout(to); this.inbox.splice(this.inbox.indexOf(msg), 1); res(msg); return true; } return false; });
    });
  }
  close() { this.ws.close(); }
}

test('сервер: комната, подключение, старт, ходы, переподключение', async () => {
  const proc = await startServer();
  try {
    const a = new Client(); await a.open(); await a.next((m) => m.t === 'hello');
    a.send({ t: 'create', name: 'Хост', token: 'lowrider' });
    const joined = await a.next((m) => m.t === 'joined');
    assert.match(joined.code, /^[A-Z]{4}$/);
    const b = new Client(); await b.open(); await b.next((m) => m.t === 'hello');
    b.send({ t: 'join', code: joined.code.toLowerCase(), name: 'Гость', token: 'lowrider' });
    const jb = await b.next((m) => m.t === 'joined');
    assert.equal(jb.pid, 'p2');
    let room = await a.next((m) => m.t === 'room' && m.room.players.length === 2);
    assert.equal(room.room.players[1].token !== 'lowrider', true); // фишка занята — выдали другую
    b.send({ t: 'add_bot' });
    const err = await b.next((m) => m.t === 'error');
    assert.match(err.msg, /хост/);
    a.send({ t: 'add_bot' });
    room = await a.next((m) => m.t === 'room' && m.room.players.length === 3);
    assert.equal(room.room.players[2].bot, true);
    a.send({ t: 'settings', settings: { startCash: 2000, auctions: false, lang: 'ru' } });
    room = await a.next((m) => m.t === 'room' && m.room.settings.startCash === 2000);
    assert.equal(room.room.settings.lang, 'ru');
    assert.equal(room.room.players[2].name, RU.bots[0]); // бот переименован на русский
    a.send({ t: 'settings', settings: { lang: 'xx' } });
    room = await a.next((m) => m.t === 'room' && m.room.players.length === 3);
    assert.equal(room.room.settings.lang, 'ru'); // неизвестный язык игнорируется
    a.send({ t: 'start' });
    const st = await b.next((m) => m.t === 'state');
    assert.equal(st.state.players.length, 3);
    assert.equal(st.state.players[0].cash, 2000);
    // гость пытается ходить не в свой ход
    b.send({ t: 'action', action: { type: 'roll' } });
    const e2 = await b.next((m) => m.t === 'error');
    assert.match(e2.msg, /нельзя/);
    // хост бросает
    a.send({ t: 'action', action: { type: 'roll', pid: 'p2' } }); // pid подменяется сервером
    const s2 = await b.next((m) => m.t === 'state' && m.state.dice);
    assert.ok(s2.events.some((e) => e.type === 'dice' && e.pid === 'p1'));
    // переподключение гостя
    b.close();
    await a.next((m) => m.t === 'room' && m.room.players[1] && m.room.players[1].connected === false);
    const b2 = new Client(); await b2.open(); await b2.next((m) => m.t === 'hello');
    b2.send({ t: 'rejoin', code: joined.code, pid: jb.pid, secret: jb.secret });
    const rj = await b2.next((m) => m.t === 'joined');
    assert.equal(rj.pid, 'p2');
    const s3 = await b2.next((m) => m.t === 'state');
    assert.ok(s3.state.turnNo >= 1);
    // неверный секрет
    const c = new Client(); await c.open(); await c.next((m) => m.t === 'hello');
    c.send({ t: 'rejoin', code: joined.code, pid: jb.pid, secret: 'nope' });
    const e3 = await c.next((m) => m.t === 'error');
    assert.match(e3.msg, /вернуться/);
    // гость исчезает надолго → за него играет бот
    b2.close();
    const botified = await a.next((m) => m.t === 'room' && m.room.players[1] && m.room.players[1].bot === true, 5000);
    assert.ok(botified);
    // статика
    const html = await fetch(`http://localhost:${PORT}/`).then((r) => r.status);
    const health = await fetch(`http://localhost:${PORT}/health`).then((r) => r.json());
    assert.equal(health.ok, true);
    assert.ok([200, 404].includes(html));
    const srv = await fetch(`http://localhost:${PORT}/server/index.js`).then((r) => r.status);
    assert.equal(srv, 404);
    a.close(); c.close();
  } finally { proc.kill(); }
});
