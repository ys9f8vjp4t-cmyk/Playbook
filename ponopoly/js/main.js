// Po'Nopoly — контроллер приложения: экраны, локальная игра с ботами, онлайн-комнаты, Telegram.
import { BOARD, TOKENS, BOT_NAMES, DEFAULT_SETTINGS, PLAYER_COLORS, LANGS, langOf, term, botNames, sqName } from './data.js';
import { RU } from './ru.js';
import { createGame, applyAction, PHASE, whoActs, current, legalActions, ownedBy, liquidValue, EngineError } from './engine.js';
import { nextBotAction, botDelay } from './bot.js';
import { initTelegram, tgUser, startParam, haptic, showBack, hideBack, inTelegram, shareInvite, inviteLink } from './telegram.js';
import { saveGame, loadGame, clearGame, getPref, setPref } from './storage.js';
import { Online, defaultServerUrl } from './online.js';
import * as UI from './ui.js';

const { $, esc, money, toast, openModal, closeModal, confirmDialog, promptNumber, currentModal, tokenOf } = UI;

const app = {
  mode: null, st: null, refs: null, online: null, prevCash: {}, animating: Promise.resolve(), botTimer: null,
  dismissed: null, saveTimer: null, screen: 'menu', setupPlayers: [], setupSettings: { ...DEFAULT_SETTINGS },
};

// ---------- контекст для UI ----------
const ctx = {
  get mode() { return app.mode; },
  me: () => (app.mode === 'online' && app.online ? app.online.you : null),
  isHuman: (pid) => {
    const p = app.st && app.st.players.find((x) => x.id === pid);
    if (!p || p.bot) return false;
    return app.mode === 'online' ? pid === app.online.you : true;
  },
  openPlayer: (pid) => showPlayer(pid),
  onDock: (act, pid) => onDock(act, pid),
};

// На этом устройстве «смотрит» либо онлайн-игрок, либо тот, чей сейчас ход (хот-сит).
function viewer() {
  if (app.mode === 'online') return app.online.you;
  const acting = whoActs(app.st)[0];
  const p = acting && app.st.players.find((x) => x.id === acting);
  return p && !p.bot ? p.id : current(app.st).id;
}

// ---------- экраны ----------
function showScreen(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === `screen-${id}`));
  if (id !== 'game') document.documentElement.dataset.lang = prefLang();
  app.screen = id;
  window.scrollTo(0, 0);
  if (id === 'menu') hideBack(); else showBack(() => onBack());
}
async function onBack() {
  if (app.screen === 'game') { await leaveGamePrompt(); return; }
  if (app.screen === 'online' && app.online && app.online.code) { if (await confirmDialog('Выйти из комнаты?', 'Выйти', true)) { app.online.leave(); renderOnline(); showScreen('menu'); } return; }
  showScreen('menu');
}

function renderMenu() {
  const saved = getPref('hasSave', false);
  $('#btn-continue').hidden = !saved;
  const sess = Online.savedSession();
  $('#btn-rejoin').hidden = !sess;
  $('#menu-user').textContent = tgUser() ? `Привет, ${tgUser().name}!` : '';
  const lang = prefLang();
  document.documentElement.dataset.lang = lang;
  $('#menu-logo').innerHTML = `${esc(term(lang, 'logo'))}<small>${esc(term(lang, 'logoSub'))}</small>`;
  document.querySelectorAll('#lang-seg button').forEach((b) => b.classList.toggle('on', b.dataset.lang === lang));
  $('#menu-fine-en').hidden = lang !== 'en';
  $('#menu-fine-ru').hidden = lang !== 'ru';
  const cfg = window.PONOPOLY_CONFIG || {};
  $('#btn-online').hidden = !!cfg.disableOnline;
  if (cfg.disableOnline) $('#btn-rejoin').hidden = true;
}

// ---------- настройка локальной игры ----------
function defaultName() { const u = tgUser(); return u ? u.name : (getPref('name', '') || 'Ты'); }
function prefLang() { const l = getPref('lang', 'en'); return LANGS.includes(l) ? l : 'en'; }
// Переименовать ботов с «именами по умолчанию» при смене языка доски.
function renameDefaultBots(list, lang) {
  const all = [BOT_NAMES, RU.bots];
  for (const p of list) {
    if (!p.bot) continue;
    for (const names of all) { const k = names.indexOf(p.name); if (k >= 0) { p.name = botNames(lang)[k]; break; } }
  }
}

function initSetup() {
  const names = botNames(prefLang());
  app.setupPlayers = [
    { name: defaultName(), token: 'lowrider', bot: false },
    { name: names[1], token: 'pager', bot: true },
    { name: names[0], token: 'boombox', bot: true },
  ];
  app.setupSettings = { ...DEFAULT_SETTINGS, ...(getPref('settings', {}) || {}), lang: prefLang() };
  renderSetup();
}

function renderSetup() {
  const list = $('#setup-players');
  list.innerHTML = '';
  app.setupPlayers.forEach((p, i) => {
    const row = document.createElement('div');
    row.className = 'player-row';
    row.innerHTML = `<button class="token-pick gold" title="Фишка">${tokenOf(p.token).emoji}</button>
      <input class="input" value="${esc(p.name)}" maxlength="20" placeholder="Имя" aria-label="Имя игрока">
      <div class="seg"><button class="${p.bot ? '' : 'on'}" data-t="h">Человек</button><button class="${p.bot ? 'on' : ''}" data-t="b">Бот</button></div>
      <button class="btn btn-xs btn-ghost" title="Убрать" ${app.setupPlayers.length <= 2 ? 'disabled' : ''}>✕</button>`;
    row.querySelector('.token-pick').addEventListener('click', () => pickToken(i));
    row.querySelector('input').addEventListener('input', (e) => { p.name = e.target.value; });
    row.querySelectorAll('.seg button').forEach((b) => b.addEventListener('click', () => { p.bot = b.dataset.t === 'b'; if (p.bot && (!p.name || p.name === 'Ты')) p.name = botNames(app.setupSettings.lang).find((n) => !app.setupPlayers.some((q) => q.name === n)) || 'Бот'; renderSetup(); }));
    row.querySelector('.btn-ghost').addEventListener('click', () => { app.setupPlayers.splice(i, 1); renderSetup(); });
    list.appendChild(row);
  });
  $('#btn-add-player').disabled = app.setupPlayers.length >= 6;
  $('#set-cash').value = String(app.setupSettings.startCash);
  $('#set-lang').value = app.setupSettings.lang || 'en';
  $('#set-auctions').checked = !!app.setupSettings.auctions;
  $('#set-parking').checked = !!app.setupSettings.freeParkingPool;
}

function pickToken(i, onPick) {
  const used = new Set((app.setupPlayers || []).filter((_, k) => k !== i).map((p) => p.token));
  const sheet = openModal(`<h2>Фишка</h2><div class="token-grid">${TOKENS.map((t) => `<button data-token="${t.id}" ${used.has(t.id) ? 'disabled' : ''}><span class="e">${t.emoji}</span>${esc(t.name)}</button>`).join('')}</div>`, { kind: 'token' });
  sheet.querySelectorAll('[data-token]').forEach((b) => b.addEventListener('click', () => {
    if (onPick) onPick(b.dataset.token); else { app.setupPlayers[i].token = b.dataset.token; renderSetup(); }
    closeModal();
  }));
}

function readSettings() {
  app.setupSettings.startCash = Number($('#set-cash').value) || 1500;
  app.setupSettings.auctions = $('#set-auctions').checked;
  app.setupSettings.freeParkingPool = $('#set-parking').checked;
  app.setupSettings.lang = LANGS.includes($('#set-lang').value) ? $('#set-lang').value : 'en';
  setPref('lang', app.setupSettings.lang);
  setPref('settings', app.setupSettings);
}

function startLocalFromSetup() {
  readSettings();
  const players = app.setupPlayers.map((p, i) => ({ name: (p.name || '').trim() || (p.bot ? BOT_NAMES[i] : `Игрок ${i + 1}`), token: p.token, bot: p.bot, color: PLAYER_COLORS[i] }));
  if (players.some((p) => !p.bot)) setPref('name', players.find((p) => !p.bot).name);
  let st;
  try { st = createGame({ players, settings: app.setupSettings }); } catch (e) { toast(e.message, 'err'); return; }
  startGame('local', st);
}

// ---------- игра ----------
function startGame(mode, st) {
  app.mode = mode; app.st = st; app.dismissed = null; app.prevCash = {};
  if (!app.refs || app.refs.lang !== langOf(st)) app.refs = UI.buildBoard($('#board'), langOf(st));
  showScreen('game');
  requestAnimationFrame(() => { sync(); if (mode === 'local') { persist(); scheduleBots(); } });
}

function persist(now = false) {
  if (app.mode !== 'local' || !app.st) return;
  clearTimeout(app.saveTimer);
  const st = app.st;
  const save = () => { saveGame(st); setPref('hasSave', st.phase !== PHASE.OVER); };
  if (now) save(); else app.saveTimer = setTimeout(save, 300);
}

function snapshotCash() { app.prevCash = Object.fromEntries(app.st.players.map((p) => [p.id, p.cash])); }

function dispatch(action) {
  if (!app.st) return;
  if (app.mode === 'online') { app.online.action(action); return; }
  snapshotCash();
  let ev;
  try { ev = applyAction(app.st, action); }
  catch (e) { toast(e.message, 'err'); haptic('error'); if (!(e instanceof EngineError)) console.error(e); return; }
  afterChange(ev);
}

async function afterChange(ev) {
  clearTimeout(app.botTimer);
  UI.renderStrip(app.st, $('#pstrip'), ctx, app.prevCash);
  UI.renderBoard(app.st, app.refs);
  UI.renderDock(app.st, $('#dock'), ctx, true);
  const run = playEvents(ev);
  app.animating = run;
  await run;
  if (app.animating !== run) return; // пришло новое состояние
  sync();
  persist();
  scheduleBots();
}

async function playEvents(ev) {
  const st = app.st;
  for (const e of ev) {
    switch (e.type) {
      case 'dice': await UI.animateDice(app.refs, e.dice); haptic('medium'); break;
      case 'move': UI.highlightCell(app.refs, null); await UI.animateMove(st, app.refs, e); UI.highlightCell(app.refs, e.to); break;
      case 'jail': haptic('error'); break;
      case 'buy': haptic('success'); break;
      case 'rent': if (e.amount > 0) toast(`${UI.pname(st, e.from)} платит ${money(e.amount)} → ${UI.pname(st, e.to)}`); break;
      case 'bankrupt': toast(`${UI.pname(st, e.pid)} — банкрот`, 'err'); haptic('warning'); break;
      case 'winner': haptic('success'); break;
      case 'trade_done': toast('Сделка состоялась', 'ok'); break;
      case 'trade_rejected': toast('Сделка отклонена'); break;
      case 'turn': {
        const p = st.players.find((x) => x.id === e.pid);
        if (app.mode === 'local' && p && !p.bot && st.players.filter((q) => !q.bot && !q.bankrupt).length > 1) toast(`Ход: ${p.name}`, 'ok');
        if (app.mode === 'online' && e.pid === app.online.you) { toast('Твой ход', 'ok'); haptic('success'); }
        break;
      }
      default: break;
    }
  }
}

function sync() {
  const st = app.st;
  if (!st || app.screen !== 'game') return;
  if (!app.refs || app.refs.lang !== langOf(st)) app.refs = UI.buildBoard($('#board'), langOf(st));
  document.documentElement.dataset.lang = langOf(st);
  UI.renderStrip(st, $('#pstrip'), ctx, app.prevCash);
  UI.renderBoard(st, app.refs);
  UI.positionTokens(st, app.refs);
  UI.renderDock(st, $('#dock'), ctx, false);
  syncModal();
}

function scheduleBots() {
  clearTimeout(app.botTimer);
  if (app.mode !== 'local' || !app.st || app.st.phase === PHASE.OVER) return;
  const a = nextBotAction(app.st);
  if (!a) return;
  app.botTimer = setTimeout(async () => {
    await app.animating;
    const b = nextBotAction(app.st);
    if (b) dispatch(b);
  }, botDelay(a) * (getPref('fast', false) ? 0.3 : 1));
}

// ---------- модалки, зависящие от состояния ----------
function requiredModal() {
  const st = app.st;
  const acting = whoActs(st)[0];
  const p = acting && st.players.find((x) => x.id === acting);
  const human = p && ctx.isHuman(p.id);
  if (st.phase === PHASE.OVER) return { kind: 'gameover', key: `over:${st.winner}`, closable: true, html: () => UI.gameOverHtml(st) };
  if (st.phase === PHASE.AUCTION) return { kind: 'auction', key: `auction:${st.auction.idx}:${st.auction.turnPid}:${JSON.stringify(st.auction.bids)}:${st.auction.passed.length}`, closable: false, html: () => UI.auctionHtml(st, ctx) };
  if (st.trade) {
    const involved = ctx.isHuman(st.trade.to) || ctx.isHuman(st.trade.from);
    return { kind: 'trade_in', key: `trade:${JSON.stringify(st.trade)}`, closable: !involved, html: () => UI.incomingTradeHtml(st, ctx) };
  }
  if (st.phase === PHASE.CARD) return { kind: 'card', key: `card:${st.card.id}:${st.turnNo}:${st.log.length}`, closable: false, html: () => UI.cardHtml(st, human) };
  if (st.phase === PHASE.TAX && human) return { kind: 'tax', key: `tax:${st.turnNo}`, closable: false, html: () => UI.taxHtml(st) };
  if (st.phase === PHASE.DEBT && human) return { kind: 'manage', key: `debt:${st.debt.amount}:${p.cash}:${ownedBy(st, p.id).length}`, closable: true, html: () => UI.manageHtml(st, p.id, st.debt), viewer: p.id };
  return null;
}

function syncModal() {
  const req = requiredModal();
  const cur = currentModal();
  if (req) {
    if (app.dismissed === req.key) return;
    if (cur && cur.kind === req.kind && cur.key === req.key) return;
    if (cur && cur.kind === 'confirm') return;
    renderStateModal(req);
    return;
  }
  if (cur && cur.sticky) { closeModal(); return; }
  if (cur && cur.rerender) cur.rerender();
}

function renderStateModal(req) {
  const sheet = openModal(req.html(), { kind: req.kind, key: req.key, sticky: true, closable: req.closable, onClose: () => { app.dismissed = req.key; } });
  bindSheet(sheet, req.viewer || viewer());
}

// Общая привязка кнопок внутри любого окна.
function bindSheet(sheet, viewerPid) {
  sheet.addEventListener('click', async (e) => {
    const pa = e.target.closest('[data-pact]');
    if (pa) { if (!pa.disabled) { const s = currentModal(); if (s) s.onClose = null; dispatch({ type: pa.dataset.pact, pid: viewerPid, idx: Number(pa.dataset.idx) }); } e.stopPropagation(); return; }
    const cl = e.target.closest('[data-close]');
    if (cl) { closeModal(); return; }
    const act = e.target.closest('[data-act]');
    if (act) { await onSheetAct(act, viewerPid); return; }
    const op = e.target.closest('[data-open]');
    if (op) { showSquare(Number(op.dataset.open)); }
  });
}

async function onSheetAct(btn, viewerPid) {
  const st = app.st;
  const acting = whoActs(st)[0];
  const a = btn.dataset.act;
  const s = currentModal(); if (s) s.onClose = null;
  switch (a) {
    case 'ack_card': dispatch({ type: 'ack_card', pid: acting }); break;
    case 'tax': dispatch({ type: 'tax', pid: acting, mode: btn.dataset.mode }); break;
    case 'bid': dispatch({ type: 'bid', pid: acting, amount: Number(btn.dataset.amount) }); break;
    case 'bid_custom': {
      const p = st.players.find((x) => x.id === acting);
      const v = await promptNumber('Твоя ставка', st.auction.highest ? st.auction.highest.amount + 10 : 10, p.cash);
      if (v != null) dispatch({ type: 'bid', pid: acting, amount: v }); else syncModal();
      break;
    }
    case 'pass': dispatch({ type: 'pass', pid: acting }); break;
    case 'trade_accept': dispatch({ type: 'trade_accept', pid: st.trade.to }); break;
    case 'trade_reject': dispatch({ type: 'trade_reject', pid: st.trade.to }); break;
    case 'trade_cancel': dispatch({ type: 'trade_cancel', pid: st.trade.from }); break;
    case 'to_menu': closeModal(); await leaveGame(true); break;
    default: break;
  }
}

// ---------- пользовательские окна ----------
function showSquare(idx) {
  const v = viewer();
  const sheet = openModal(UI.squareHtml(app.st, idx, v) + '<div class="actions"><button class="btn" data-close="1">Закрыть</button></div>', { kind: 'square', key: String(idx) });
  const s = currentModal(); s.rerender = () => { const sh = currentModal() && document.querySelector('.modal .sheet'); if (sh) { sh.innerHTML = UI.squareHtml(app.st, idx, viewer()) + '<div class="actions"><button class="btn" data-close="1">Закрыть</button></div>'; } };
  bindSheet(sheet, v);
}
function showManage() {
  const v = viewer();
  const sheet = openModal(UI.manageHtml(app.st, v, null), { kind: 'manage', key: v });
  const s = currentModal(); s.rerender = () => { const sh = document.querySelector('.modal .sheet'); if (sh) sh.innerHTML = UI.manageHtml(app.st, v, app.st.phase === PHASE.DEBT && app.st.debt.pid === v ? app.st.debt : null); };
  bindSheet(sheet, v);
}
function showPlayer(pid) {
  const v = viewer();
  const sheet = openModal(UI.playerHtml(app.st, pid, v), { kind: 'player', key: pid });
  const s = currentModal(); s.rerender = () => { const sh = document.querySelector('.modal .sheet'); if (sh) sh.innerHTML = UI.playerHtml(app.st, pid, viewer()); };
  bindSheet(sheet, v);
}
function showLog() { const sheet = openModal(UI.logHtml(app.st, viewer()), { kind: 'log' }); bindSheet(sheet, viewer()); }

function showTradeBuilder() {
  const st = app.st; const me = viewer();
  const sheet = openModal(UI.tradeBuilderHtml(st, me), { kind: 'trade' });
  const sel = sheet.querySelector('#trade-to');
  const fillGet = () => {
    const to = sel.value;
    const props = ownedBy(st, to);
    sheet.querySelector('#get-props').innerHTML = props.map((i) => `<label class="check"><input type="checkbox" name="get" value="${i}"><span class="sw" style="--gc:${UI.colorOf(i)}"></span>${esc(sqName(st, i))}${st.props[i].mortgaged ? ` ${UI.dnTag(st)}` : ''}</label>`).join('') || '<div class="sub">нет клеток</div>';
    const toP = st.players.find((p) => p.id === to);
    sheet.querySelector('#get-card-wrap').hidden = !toP.jailCards.length;
    sheet.querySelector('#get-cash').max = toP.cash;
  };
  sel.addEventListener('change', fillGet); fillGet();
  sheet.querySelector('#trade-send').addEventListener('click', () => {
    const give = { cash: Number(sheet.querySelector('#give-cash').value) || 0, props: [...sheet.querySelectorAll('input[name=give]:checked')].map((i) => Number(i.value)), cards: sheet.querySelector('#give-card') && sheet.querySelector('#give-card').checked ? 1 : 0 };
    const get = { cash: Number(sheet.querySelector('#get-cash').value) || 0, props: [...sheet.querySelectorAll('input[name=get]:checked')].map((i) => Number(i.value)), cards: sheet.querySelector('#get-card').checked ? 1 : 0 };
    closeModal();
    dispatch({ type: 'trade_offer', pid: me, to: sel.value, give, get });
  });
  bindSheet(sheet, me);
}

function showGameMenu() {
  const st = app.st; const v = viewer();
  const canSurrender = st.phase !== PHASE.OVER && legalActions(st, v).includes('surrender');
  const sheet = openModal(`<h2>Меню</h2><div class="list">
    <button class="btn" data-m="rules">Правила</button>
    <button class="btn" data-m="fast">${getPref('fast', false) ? '✓ ' : ''}Быстрые боты</button>
    <button class="btn" data-m="lang" ${app.mode === 'online' ? 'disabled' : ''}>Доска: ${langOf(st) === 'ru' ? 'полностью по-русски' : 'как в фильме'} → ${langOf(st) === 'ru' ? 'как в фильме' : 'по-русски'}${app.mode === 'online' ? ' (задаёт хост)' : ''}</button>
    ${canSurrender ? `<button class="btn btn-danger" data-m="surrender">Сдаться (${esc(UI.pname(st, v))})</button>` : ''}
    <button class="btn" data-m="leave">${app.mode === 'online' ? 'Выйти из комнаты' : 'В главное меню'}</button>
    <button class="btn btn-ghost" data-close="1">Закрыть</button></div>`, { kind: 'menu' });
  sheet.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-m]'); if (!b) { if (e.target.closest('[data-close]')) closeModal(); return; }
    const m = b.dataset.m; closeModal();
    if (m === 'rules') { openModal(UI.rulesHtml(langOf(st)) + '<div class="actions"><button class="btn" data-close="1">Закрыть</button></div>', { kind: 'rules' }).addEventListener('click', (ev) => { if (ev.target.closest('[data-close]')) closeModal(); }); }
    if (m === 'lang' && app.mode === 'local') { st.settings.lang = langOf(st) === 'ru' ? 'en' : 'ru'; setPref('lang', st.settings.lang); renameDefaultBots(st.players, st.settings.lang); sync(); persist(); toast(st.settings.lang === 'ru' ? 'Доска полностью по-русски' : 'Доска как в фильме'); }
    if (m === 'fast') { setPref('fast', !getPref('fast', false)); toast(getPref('fast', false) ? 'Боты ходят быстро' : 'Боты ходят спокойно'); }
    if (m === 'surrender' && await confirmDialog(`${UI.pname(st, v)}, точно сдаёшься?`, 'Сдаюсь', true)) dispatch({ type: 'surrender', pid: v });
    if (m === 'leave') await leaveGamePrompt();
  });
}

async function leaveGamePrompt() {
  const text = app.mode === 'online' ? 'Выйти из комнаты? За тебя доиграет бот.' : 'Выйти в меню? Партия сохранится, можно продолжить позже.';
  if (await confirmDialog(text, 'Выйти')) await leaveGame(false);
}

async function leaveGame(finished) {
  clearTimeout(app.botTimer);
  closeModal();
  clearTimeout(app.saveTimer);
  if (app.mode === 'online') { if (app.online) { app.online.leave(); } renderOnline(); }
  else if (finished || (app.st && app.st.phase === PHASE.OVER)) { await clearGame(); setPref('hasSave', false); }
  else persist(true);
  app.st = null; app.mode = null;
  renderMenu();
  showScreen('menu');
}

function onDock(act, pid) {
  const st = app.st;
  switch (act) {
    case 'roll': case 'jail_pay': case 'jail_card': case 'buy': case 'skip_buy': case 'end_turn': dispatch({ type: act, pid }); break;
    case 'bankrupt': confirmDialog('Объявить банкротство? Всё имущество уйдёт кредитору.', 'Банкрот', true).then((ok) => ok && dispatch({ type: 'bankrupt', pid })); break;
    case 'tax_modal': case 'card_modal': case 'auction_modal': case 'trade_modal': app.dismissed = null; syncModal(); break;
    case 'manage': app.dismissed = null; if (st.phase === PHASE.DEBT && ctx.isHuman(st.debt.pid)) syncModal(); else showManage(); break;
    case 'trade': showTradeBuilder(); break;
    case 'log': showLog(); break;
    case 'menu': showGameMenu(); break;
    case 'gameover': app.dismissed = null; syncModal(); break;
    default: break;
  }
}

// ---------- онлайн ----------
function ensureOnline() {
  if (app.online) return app.online;
  const o = new Online();
  o.on('joined', () => renderOnline());
  o.on('room', (room) => { renderOnline(); if (room.started && app.mode !== 'online' && o.state) startGame('online', o.state); });
  o.on('state', ({ state, events }) => {
    const first = app.mode !== 'online' || !app.st;
    if (first) { startGame('online', state); return; }
    snapshotCash();
    app.st = state;
    afterChange(events);
  });
  o.on('error', (msg) => { toast(msg, 'err'); haptic('error'); });
  o.on('kicked', () => { toast('Хост убрал тебя из комнаты', 'err'); if (app.mode === 'online') leaveGame(false); else renderOnline(); });
  o.on('close', () => { if (app.screen === 'online' || app.mode === 'online') setConn('Нет связи с сервером…', true); });
  o.on('reconnecting', () => setConn('Переподключаемся…', true));
  o.on('open', () => setConn('На связи', false));
  app.online = o;
  return o;
}
function setConn(text, bad) { const el = $('#conn'); if (el) { el.textContent = text; el.classList.toggle('bad', !!bad); } }

let onlineToken = getPref('token', 'lowrider');
function renderOnline() {
  const o = app.online;
  const lobby = $('#online-lobby'); const join = $('#online-join');
  $('#online-name').value = $('#online-name').value || defaultName();
  $('#online-token').textContent = tokenOf(onlineToken).emoji;
  $('#online-url').value = getPref('serverUrl', '') || (window.PONOPOLY_CONFIG && window.PONOPOLY_CONFIG.serverUrl) || '';
  $('#online-url').placeholder = defaultServerUrl() || 'wss://example.com/ws';
  if (!o || !o.code || !o.room) { lobby.hidden = true; join.hidden = false; return; }
  join.hidden = true; lobby.hidden = false;
  const room = o.room;
  const isHost = room.host === o.you;
  $('#lobby-code').textContent = room.code;
  $('#lobby-players').innerHTML = room.players.map((p) => `<div class="item"><span class="tok" style="font-size:20px">${tokenOf(p.token).emoji}</span><div class="t">${esc(p.name)}${p.id === room.host ? ' <span class="crown" title="Хост">👑</span>' : ''}${p.bot ? ' 🤖' : ''}${p.id === o.you ? ' <small>(ты)</small>' : ''}${!p.connected ? ' <small class="dn">не в сети</small>' : ''}</div>${isHost && p.id !== o.you ? `<button class="btn btn-xs" data-kick="${p.id}">✕</button>` : ''}</div>`).join('');
  $('#lobby-players').querySelectorAll('[data-kick]').forEach((b) => b.addEventListener('click', () => o.kick(b.dataset.kick)));
  $('#lobby-host').hidden = !isHost;
  $('#lobby-wait').hidden = isHost;
  $('#lobby-cash').value = String(room.settings.startCash);
  $('#lobby-auctions').checked = !!room.settings.auctions;
  $('#lobby-parking').checked = !!room.settings.freeParkingPool;
  $('#lobby-lang').value = room.settings.lang || 'en';
  $('#btn-start-online').disabled = room.players.length < 2;
  $('#btn-add-bot').disabled = room.players.length >= 6;
  $('#lobby-link').textContent = inviteLink(room.code);
}

async function onlineConnect() {
  const o = ensureOnline();
  const url = ($('#online-url').value || '').trim() || defaultServerUrl();
  if (!url) { toast('Укажи адрес сервера', 'err'); $('#online-advanced').open = true; return null; }
  if ($('#online-url').value.trim()) setPref('serverUrl', $('#online-url').value.trim());
  if (o.connected && o.url === url) return o;
  setConn('Подключаемся…', false);
  try { await o.connect(url); return o; }
  catch (e) { setConn(e.message, true); toast(e.message, 'err'); $('#online-advanced').open = true; return null; }
}
function onlineName() { const n = ($('#online-name').value || '').trim().slice(0, 20) || 'Игрок'; setPref('name', n); setPref('token', onlineToken); return n; }

async function onlineCreate() { const o = await onlineConnect(); if (o) o.create(onlineName(), onlineToken); }
async function onlineJoin(code) {
  code = (code || $('#online-code').value || '').trim().toUpperCase();
  if (code.length !== 4) { toast('Код комнаты — 4 буквы', 'err'); return; }
  const o = await onlineConnect(); if (o) o.join(code, onlineName(), onlineToken);
}
async function onlineRejoin() {
  const sess = Online.savedSession();
  if (!sess) return;
  const o = ensureOnline();
  try { await o.connect(sess.url); o.rejoin(sess); showScreen('online'); renderOnline(); }
  catch (e) { toast('Не удалось вернуться: ' + e.message, 'err'); setPref('online', null); renderMenu(); }
}

// ---------- запуск ----------
function bindStatic() {
  $('#btn-new').addEventListener('click', () => { initSetup(); showScreen('setup'); });
  $('#btn-continue').addEventListener('click', async () => {
    const st = await loadGame();
    if (!st) { toast('Сохранение не найдено', 'err'); setPref('hasSave', false); renderMenu(); return; }
    startGame('local', st);
  });
  $('#btn-online').addEventListener('click', () => { ensureOnline(); showScreen('online'); renderOnline(); });
  $('#btn-rejoin').addEventListener('click', onlineRejoin);
  $('#btn-rules').addEventListener('click', () => { $('#rules-body').innerHTML = UI.rulesHtml(prefLang()); showScreen('rules'); });
  $('#btn-add-player').addEventListener('click', () => { const i = app.setupPlayers.length; app.setupPlayers.push({ name: botNames(app.setupSettings.lang).find((n) => !app.setupPlayers.some((q) => q.name === n)) || `Бот ${i + 1}`, token: TOKENS.find((t) => !app.setupPlayers.some((q) => q.token === t.id)).id, bot: true }); renderSetup(); });
  $('#btn-start-local').addEventListener('click', startLocalFromSetup);
  document.querySelectorAll('[data-back]').forEach((b) => b.addEventListener('click', () => onBack()));
  // онлайн
  $('#online-token').addEventListener('click', () => pickToken(-1, (t) => { onlineToken = t; renderOnline(); }));
  $('#btn-create-room').addEventListener('click', onlineCreate);
  $('#btn-join-room').addEventListener('click', () => onlineJoin());
  $('#online-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') onlineJoin(); });
  $('#btn-add-bot').addEventListener('click', () => app.online.addBot());
  $('#btn-start-online').addEventListener('click', () => app.online.start());
  $('#btn-invite').addEventListener('click', () => { if (!shareInvite(app.online.code)) { navigator.clipboard && navigator.clipboard.writeText(inviteLink(app.online.code)).then(() => toast('Ссылка скопирована', 'ok')).catch(() => toast('Код: ' + app.online.code)); } });
  $('#btn-copy-code').addEventListener('click', () => { navigator.clipboard && navigator.clipboard.writeText(app.online.code).then(() => toast('Код скопирован', 'ok')).catch(() => {}); });
  $('#btn-leave-room').addEventListener('click', async () => { if (await confirmDialog('Выйти из комнаты?', 'Выйти', true)) { app.online.leave(); renderOnline(); } });
  for (const id of ['lobby-cash', 'lobby-auctions', 'lobby-parking', 'lobby-lang']) $(`#${id}`).addEventListener('change', () => app.online.settings({ startCash: Number($('#lobby-cash').value), auctions: $('#lobby-auctions').checked, freeParkingPool: $('#lobby-parking').checked, lang: $('#lobby-lang').value }));
  document.querySelectorAll('#lang-seg button').forEach((b) => b.addEventListener('click', () => { setPref('lang', b.dataset.lang); renderMenu(); haptic('selection'); }));
  $('#set-lang').addEventListener('change', () => { const l = $('#set-lang').value; renameDefaultBots(app.setupPlayers, l); app.setupSettings.lang = l; renderSetup(); });
  // доска: клик по клетке
  $('#board').addEventListener('click', (e) => { const c = e.target.closest('.cell'); if (c && app.st) showSquare(Number(c.dataset.idx)); });
  new ResizeObserver(() => { if (app.st && app.screen === 'game') UI.positionTokens(app.st, app.refs); }).observe($('#board'));
  window.addEventListener('resize', () => { if (app.st && app.screen === 'game') UI.positionTokens(app.st, app.refs); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && currentModal() && !currentModal().sticky) closeModal(); });
}

async function boot() {
  initTelegram();
  bindStatic();
  app.refs = UI.buildBoard($('#board'), prefLang());
  renderMenu();
  showScreen('menu');
  // приглашение в комнату: ?room=CODE или start_param в Telegram
  const url = new URL(location.href);
  const code = startParam() || url.searchParams.get('room');
  if (code && /^[A-Za-z]{4}$/.test(code)) {
    ensureOnline(); showScreen('online'); renderOnline();
    $('#online-code').value = code.toUpperCase();
    if (getPref('name', '') || tgUser()) onlineJoin(code);
  } else if (Online.savedSession()) {
    // вернуться в незаконченную онлайн-партию
    const sess = Online.savedSession();
    if (Date.now() - (sess.at || 0) < 8 * 3600 * 1000 || !sess.at) renderMenu();
  }
}

boot();
