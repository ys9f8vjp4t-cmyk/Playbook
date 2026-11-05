// Рендер доски, панелей и модальных окон. Ничего не знает о правилах — только показывает state.
import { BOARD, GROUPS, TOKENS, PLAYER_COLORS, RAIL_RENT, MAX_HOUSES, JAIL_FINE, CARD_BY_ID, groupOf } from './data.js';
import { PHASE, whoActs, current, legalActions, netWorth, liquidValue, ownedBy, checks, mortgageValue, unmortgageCost, rentFor, ownsGroup, describeTrade } from './engine.js';
import { haptic } from './telegram.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const money = (n) => `$${Number(n).toLocaleString('ru-RU')}`;
export const tokenOf = (id) => TOKENS.find((t) => t.id === id) || TOKENS[0];
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function playerColor(st, pid) {
  const i = st.players.findIndex((p) => p.id === pid);
  const p = st.players[i];
  return (p && p.color) || PLAYER_COLORS[i % PLAYER_COLORS.length];
}
export function pname(st, pid) { const p = st.players.find((x) => x.id === pid); return p ? p.name : '?'; }

const ICONS = { go: '➜', jail: '🏥', parking: '🅿️', gotojail: '🚗💨', tax: '💸', chance: '?', chest: '🤝', rail: '🏪', util: '💅' };
const RAIL_ICON = { 5: '💍', 15: '🍾', 25: '👟', 35: '💵' };
const UTIL_ICON = { 12: '💅', 28: '💈' };

// ---------- board ----------
export function buildBoard(boardEl) {
  boardEl.innerHTML = '';
  const cells = [];
  for (const sq of BOARD) {
    const el = document.createElement('div');
    const pos = gridPos(sq.i);
    el.className = `cell sq-${sq.type} ${pos.side}`;
    el.style.gridRow = pos.row; el.style.gridColumn = pos.col;
    el.dataset.idx = sq.i;
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', sq.name);
    const g = groupOf(sq);
    if (g && sq.type === 'prop') el.style.setProperty('--gc', GROUPS[g].color);
    if (sq.type === 'rail') el.style.setProperty('--gc', '#2b2b2b');
    if (sq.type === 'util') el.style.setProperty('--gc', '#8a8f99');
    let inner = '';
    if (sq.type === 'prop' || sq.type === 'rail' || sq.type === 'util') {
      inner += `<div class="band"></div>`;
      const ico = sq.type === 'rail' ? RAIL_ICON[sq.i] : sq.type === 'util' ? UTIL_ICON[sq.i] : '';
      inner += `<div class="name">${ico ? `<span class="ico">${ico}</span> ` : ''}${esc(sq.short)}</div>`;
    } else if (pos.side === 'corner') {
      const ico = ICONS[sq.type] || '';
      inner += `<div class="name"><span class="ico">${ico}</span>${esc(sq.short)}</div>`;
    } else {
      const ico = sq.type === 'chance' ? '?' : sq.type === 'chest' ? ICONS.chest : sq.i === 38 ? '🔫' : ICONS.tax;
      inner += `<div class="band" style="background:transparent;border:0"></div><div class="name"><span class="ico">${ico}</span>${esc(sq.short)}</div>`;
    }
    el.innerHTML = inner;
    boardEl.appendChild(el);
    cells[sq.i] = el;
  }
  const center = document.createElement('div');
  center.className = 'center';
  center.innerHTML = `
    <div class="deck chance">NO<br>CHANCE</div>
    <div class="deck chest">COMMUNITY<br>SERVICE</div>
    <div class="big-logo">PO'NOPOLY<small>by Darker Brothers</small></div>
    ${mascotSvg()}
    <div class="dice" id="dice"><div class="die" data-v="0">${'<span></span>'.repeat(9)}</div><div class="die" data-v="0">${'<span></span>'.repeat(9)}</div></div>
    <div class="status" id="board-status">Бросай кубики</div>`;
  boardEl.appendChild(center);
  const tokens = document.createElement('div');
  tokens.className = 'tokens'; tokens.id = 'tokens';
  boardEl.appendChild(tokens);
  return { boardEl, cells, center, tokens, dice: center.querySelectorAll('.die'), status: $('#board-status', center) };
}

function gridPos(i) {
  if (i === 0) return { row: 11, col: 11, side: 'corner' };
  if (i < 10) return { row: 11, col: 11 - i, side: 'side-bottom' };
  if (i === 10) return { row: 11, col: 1, side: 'corner' };
  if (i < 20) return { row: 11 - (i - 10), col: 1, side: 'side-left' };
  if (i === 20) return { row: 1, col: 1, side: 'corner' };
  if (i < 30) return { row: 1, col: 1 + (i - 20), side: 'side-top' };
  if (i === 30) return { row: 1, col: 11, side: 'corner' };
  return { row: 1 + (i - 30), col: 11, side: 'side-right' };
}

function mascotSvg() {
  // Пародия на дядюшку-богача: бини, очки, золотая цепь, кубики в руке.
  return `<svg class="mascot" viewBox="0 0 100 100" aria-hidden="true">
    <circle cx="50" cy="52" r="26" fill="#7a4b2a"/>
    <path d="M24 44 Q50 18 76 44 L76 50 Q50 40 24 50 Z" fill="#1a2a35"/>
    <rect x="24" y="44" width="52" height="7" rx="3" fill="#2d6e3a"/>
    <rect x="28" y="52" width="18" height="9" rx="2" fill="#111"/><rect x="54" y="52" width="18" height="9" rx="2" fill="#111"/><rect x="46" y="54" width="8" height="3" fill="#111"/>
    <path d="M40 70 Q50 78 60 70" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M30 80 Q50 100 70 80" stroke="#d9a521" stroke-width="4" fill="none"/>
    <circle cx="50" cy="90" r="5" fill="#d9a521"/>
    <rect x="76" y="66" width="13" height="13" rx="2" fill="#d8242a" transform="rotate(12 82 72)"/><circle cx="82" cy="72" r="1.6" fill="#fff"/>
    <rect x="86" y="80" width="12" height="12" rx="2" fill="#d8242a" transform="rotate(-20 92 86)"/><circle cx="89" cy="83" r="1.4" fill="#fff"/><circle cx="95" cy="89" r="1.4" fill="#fff"/>
  </svg>`;
}

export function renderBoard(st, refs) {
  for (const sq of BOARD) {
    const el = refs.cells[sq.i];
    const ps = st.props[sq.i];
    if (!ps) continue;
    el.classList.toggle('mortgaged', !!ps.mortgaged);
    el.classList.toggle('owned', !!ps.owner);
    if (ps.owner) { el.style.setProperty('--oc', playerColor(st, ps.owner)); el.title = `${sq.name} — ${pname(st, ps.owner)}`; } else { el.style.removeProperty('--oc'); el.title = sq.name; }
    const band = el.querySelector('.band');
    if (band && sq.type === 'prop') {
      band.innerHTML = ps.houses === MAX_HOUSES ? '<i class="house hotel"></i>' : '<i class="house"></i>'.repeat(ps.houses);
    }
  }
  if (st.dice) refs.dice.forEach((d, i) => d.dataset.v = st.dice[i]);
}

export function highlightCell(refs, idx) {
  refs.cells.forEach((c) => c.classList.remove('hl'));
  if (idx != null && refs.cells[idx]) refs.cells[idx].classList.add('hl');
}

// ---------- tokens ----------
export function ensureTokens(st, refs) {
  const layer = refs.tokens;
  const seen = new Set();
  for (const p of st.players) {
    let el = layer.querySelector(`[data-pid="${p.id}"]`);
    if (!el) {
      el = document.createElement('div');
      el.className = 'tok'; el.dataset.pid = p.id;
      el.textContent = tokenOf(p.token).emoji;
      el.title = p.name;
      layer.appendChild(el);
    }
    el.style.setProperty('--pc', playerColor(st, p.id));
    el.classList.toggle('out', !!p.bankrupt);
    seen.add(p.id);
  }
  for (const el of [...layer.children]) if (!seen.has(el.dataset.pid)) el.remove();
}

function cellCenter(refs, idx) {
  const b = refs.boardEl.getBoundingClientRect();
  const c = refs.cells[idx].getBoundingClientRect();
  return { x: c.left - b.left + c.width / 2, y: c.top - b.top + c.height / 2, w: c.width, h: c.height };
}

// overrides: {pid: idx} — временная позиция во время анимации
export function positionTokens(st, refs, overrides = {}) {
  ensureTokens(st, refs);
  const tokEl = refs.tokens.querySelector('.tok');
  const size = tokEl ? tokEl.getBoundingClientRect().width || 20 : 20;
  const groups = {};
  for (const p of st.players) {
    const idx = overrides[p.id] != null ? overrides[p.id] : p.pos;
    (groups[idx] = groups[idx] || []).push(p);
  }
  for (const [idx, ps] of Object.entries(groups)) {
    const c = cellCenter(refs, Number(idx));
    const sq = BOARD[Number(idx)];
    const vertical = gridPos(sq.i).side === 'side-bottom' || gridPos(sq.i).side === 'side-top';
    ps.forEach((p, k) => {
      const el = refs.tokens.querySelector(`[data-pid="${p.id}"]`);
      if (!el) return;
      const n = ps.length;
      let dx = 0, dy = 0;
      if (n > 1) {
        const step = size * 0.55;
        if (vertical) { dy = (k - (n - 1) / 2) * step; dx = (k % 2 ? 1 : -1) * size * 0.18; }
        else { dx = (k - (n - 1) / 2) * step; dy = (k % 2 ? 1 : -1) * size * 0.18; }
      }
      el.style.transform = `translate(${c.x - size / 2 + dx}px, ${c.y - size / 2 + dy}px)`;
    });
  }
}

// Анимация хода фишки по клеткам.
export async function animateMove(st, refs, ev) {
  const el = refs.tokens.querySelector(`[data-pid="${ev.pid}"]`);
  if (!el || reduced()) { positionTokens(st, refs); return; }
  let path = [];
  if (ev.mode === 'forward') { let i = ev.from; while (i !== ev.to) { i = (i + 1) % 40; path.push(i); } if (!path.length) path = [ev.to]; }
  else if (ev.mode === 'back') { let i = ev.from; while (i !== ev.to) { i = (i + 39) % 40; path.push(i); } }
  else path = [ev.to];
  const per = Math.max(60, Math.min(130, 1300 / path.length));
  const overrides = {};
  for (const idx of path) {
    overrides[ev.pid] = idx;
    el.classList.remove('hop'); void el.offsetWidth; el.classList.add('hop');
    positionTokens(st, refs, overrides);
    await sleep(per);
  }
  positionTokens(st, refs);
}

export async function animateDice(refs, dice) {
  refs.dice.forEach((d, i) => { d.classList.remove('rolling'); void d.offsetWidth; d.classList.add('rolling'); d.dataset.v = dice[i]; });
  if (!reduced()) await sleep(450);
}

// ---------- player strip ----------
export function renderStrip(st, el, ctx, prevCash = {}) {
  const cur = current(st);
  el.innerHTML = '';
  for (const p of st.players) {
    const chip = document.createElement('button');
    chip.className = `pchip${p.id === cur.id && st.phase !== PHASE.OVER ? ' cur' : ''}${p.bankrupt ? ' out' : ''}${ctx.me() === p.id ? ' me' : ''}`;
    chip.style.setProperty('--pc', playerColor(st, p.id));
    const delta = prevCash[p.id] != null ? p.cash - prevCash[p.id] : 0;
    chip.innerHTML = `<span class="tok">${tokenOf(p.token).emoji}</span><span><span class="pname">${esc(p.name)}</span>${p.bot ? ' <span class="pbot">🤖</span>' : ''}${p.inJail ? ' <span class="pjail" title="В County Hospital">🏥</span>' : ''}<br><span class="pcash${delta > 0 ? ' flash-up' : delta < 0 ? ' flash-down' : ''}">${p.bankrupt ? 'банкрот' : money(p.cash)}</span></span>`;
    chip.addEventListener('click', () => ctx.openPlayer(p.id));
    el.appendChild(chip);
  }
  if (Object.keys(prevCash).length) setTimeout(() => el.querySelectorAll('.flash-up, .flash-down').forEach((c) => c.classList.remove('flash-up', 'flash-down')), 1800);
}

// ---------- dock ----------
export function renderDock(st, el, ctx, busy = false) {
  el.classList.toggle('busy', !!busy);
  const acting = whoActs(st)[0];
  const cur = current(st);
  const p = acting ? st.players.find((x) => x.id === acting) : null;
  const human = p && ctx.isHuman(p.id);
  const me = ctx.me() || (human ? p.id : cur.id);
  const legal = p ? legalActions(st, p.id) : [];
  const btn = (label, cls, on, opts = {}) => `<button class="btn ${cls}" data-act="${on}" ${opts.disabled ? 'disabled' : ''} ${opts.pulse ? 'data-pulse="1"' : ''}>${label}</button>`;
  let status = '';
  let main = '';
  if (st.phase === PHASE.OVER) {
    status = `<span>Игра окончена. Победил <b>${esc(pname(st, st.winner))}</b></span>`;
    main = btn('Итоги', 'btn-primary', 'gameover');
  } else if (!p) {
    status = '<span>…</span>';
  } else if (!human) {
    const what = st.phase === PHASE.AUCTION ? 'торгуется' : st.trade && st.trade.to === p.id ? 'думает над сделкой' : st.phase === PHASE.DEBT ? 'ищет деньги' : 'ходит';
    status = `<span>${p.bot ? '🤖 ' : ''}<b>${esc(p.name)}</b> ${what}</span>`;
    main = btn(p.bot ? 'Бот думает…' : `Ждём: ${esc(p.name)}`, 'btn-ghost', 'none', { disabled: true });
  } else {
    const you = ctx.mode === 'local' ? `<b>${esc(p.name)}</b>, ` : '';
    const cap = (t) => (you ? t : t.charAt(0).toUpperCase() + t.slice(1));
    switch (st.phase) {
      case PHASE.ROLL:
        if (p.inJail) {
          status = `<span>${you}${cap(`ты в County Hospital (попытка ${p.jailTurns + 1}/3)`)}</span>`;
          main = btn('🎲 Бросить', 'btn-primary', 'roll', { pulse: true }) + (legal.includes('jail_pay') ? btn(`Заплатить ${money(JAIL_FINE)}`, '', 'jail_pay') : '') + (legal.includes('jail_card') ? btn('Карта выписки', 'btn-gold', 'jail_card') : '');
        } else {
          status = `<span>${you}${cap(st.doubles > 0 ? 'дубль — бросай ещё' : 'твой ход')}</span>`;
          main = btn('🎲 Бросить кубики', 'btn-primary', 'roll', { pulse: true });
        }
        break;
      case PHASE.BUY: {
        const sq = BOARD[p.pos];
        status = `<span>${you}${esc(sq.name)} свободна</span>`;
        main = btn(`Купить за ${money(sq.price)}`, 'btn-gold', 'buy', { disabled: !legal.includes('buy') }) + btn(st.settings.auctions ? 'На аукцион' : 'Не покупать', '', 'skip_buy');
        break;
      }
      case PHASE.TAX: status = `<span>${you}Tax Evasion</span>`; main = btn('Выбрать, сколько платить', 'btn-primary', 'tax_modal'); break;
      case PHASE.CARD: status = `<span>${you}${cap('карта')}</span>`; main = btn('Показать карту', 'btn-primary', 'card_modal'); break;
      case PHASE.DEBT:
        status = `<span>${you}<span class="debt">${cap('долг')} ${money(st.debt.amount)}</span>, в кармане ${money(p.cash)}</span>`;
        main = btn('Добыть деньги', 'btn-primary', 'manage', { pulse: true }) + btn('Банкрот', 'btn-danger', 'bankrupt', { disabled: liquidValue(st, p.id) >= st.debt.amount });
        break;
      case PHASE.AUCTION: status = `<span>${you}${cap('аукцион')} за ${esc(BOARD[st.auction.idx].name)}</span>`; main = btn('К торгам', 'btn-primary', 'auction_modal', { pulse: true }); break;
      case PHASE.END:
        if (st.trade) { status = `<span>Сделка ждёт ответа</span>`; main = btn('Показать сделку', 'btn-primary', 'trade_modal'); }
        else { status = `<span>${you}${cap(st.doubles > 0 && !p.inJail ? 'дубль! после хода бросаешь снова' : 'ход завершён?')}</span>`; main = btn(st.doubles > 0 && !p.inJail ? '🎲 Ещё бросок' : 'Завершить ход', 'btn-primary', 'end_turn'); }
        break;
      default: break;
    }
    if (st.trade && st.phase !== PHASE.END) { status = `<span>Сделка ждёт ответа</span>`; main = btn('Показать сделку', 'btn-primary', 'trade_modal'); }
  }
  const mePlayer = st.players.find((x) => x.id === me);
  const canManage = mePlayer && !mePlayer.bankrupt && st.phase !== PHASE.OVER;
  const canTrade = canManage && legalActions(st, me).includes('trade_offer') && st.players.filter((q) => !q.bankrupt).length > 1;
  el.innerHTML = `
    <div class="status-line">${status}<span class="fine">ход ${st.turnNo}</span></div>
    <div class="main-actions">${main}</div>
    <div class="sub-actions">
      ${btn('🏠 Имущество', 'btn-sm', 'manage', { disabled: !canManage })}
      ${btn('🤝 Сделка', 'btn-sm', 'trade', { disabled: !canTrade })}
      ${btn('📜 Журнал', 'btn-sm', 'log')}
      ${btn('☰', 'btn-sm', 'menu')}
    </div>`;
  el.querySelectorAll('[data-pulse]').forEach((b) => b.classList.add('pulse'));
  el.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => ctx.onDock(b.dataset.act, p ? p.id : me)));
  renderFeed(st);
}

export function renderFeed(st) {
  const el = $('#board-status');
  const last = st.log[st.log.length - 1];
  if (el) el.textContent = last ? last.t : '';
  const feed = $('#feed');
  if (feed) feed.innerHTML = st.log.slice(-12).reverse().map((l) => `<div>${esc(l.t)}</div>`).join('');
}

// ---------- modals ----------
let modalEl = null;
let modalState = null; // { kind, key, sticky }
export function currentModal() { return modalState; }

export function openModal(html, { kind = 'custom', key = '', sticky = false, closable = true, onClose = null } = {}) {
  closeModal();
  modalEl = document.createElement('div');
  modalEl.className = 'modal';
  modalEl.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
  if (closable) modalEl.addEventListener('click', (e) => { if (e.target === modalEl) closeModal(); });
  document.body.appendChild(modalEl);
  modalState = { kind, key, sticky, onClose };
  return modalEl.firstElementChild;
}
export function closeModal() {
  if (modalEl) { const s = modalState; modalEl.remove(); modalEl = null; modalState = null; if (s && s.onClose) s.onClose(); }
}
export function isModalOpen(kind) { return !!modalState && (!kind || modalState.kind === kind); }

export function toast(text, kind = '') {
  let wrap = $('.toast-wrap');
  if (!wrap) { wrap = document.createElement('div'); wrap.className = 'toast-wrap'; document.body.appendChild(wrap); }
  const t = document.createElement('div');
  t.className = `toast ${kind}`; t.textContent = text;
  wrap.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

export function confirmDialog(text, okLabel = 'Да', danger = false) {
  return new Promise((resolve) => {
    const sheet = openModal(`<h2>${esc(text)}</h2><div class="actions"><button class="btn" data-r="0">Отмена</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-r="1">${esc(okLabel)}</button></div>`, { kind: 'confirm', closable: true, onClose: () => resolve(false) });
    sheet.querySelectorAll('[data-r]').forEach((b) => b.addEventListener('click', () => { const r = b.dataset.r === '1'; modalState.onClose = null; closeModal(); resolve(r); }));
  });
}

export function promptNumber(title, def, max) {
  return new Promise((resolve) => {
    const sheet = openModal(`<h2>${esc(title)}</h2><input class="input" id="num-in" type="number" inputmode="numeric" min="0" max="${max}" value="${def}"><div class="actions"><button class="btn" data-r="0">Отмена</button><button class="btn btn-primary" data-r="1">Ок</button></div>`, { kind: 'prompt', onClose: () => resolve(null) });
    const inp = sheet.querySelector('#num-in'); inp.focus(); inp.select();
    sheet.querySelectorAll('[data-r]').forEach((b) => b.addEventListener('click', () => { const v = b.dataset.r === '1' ? Number(inp.value) : null; modalState.onClose = null; closeModal(); resolve(v); }));
  });
}

// Карточка клетки (с кнопками управления, если это твоя клетка)
export function squareHtml(st, idx, viewer) {
  const sq = BOARD[idx];
  const ps = st.props[idx];
  const g = groupOf(sq);
  const gc = sq.type === 'prop' ? GROUPS[g].color : sq.type === 'rail' ? '#2b2b2b' : sq.type === 'util' ? '#8a8f99' : '#1a2a35';
  const gt = sq.type === 'prop' ? GROUPS[g].text : '#fff';
  let body = '';
  if (sq.type === 'prop') {
    const mono = ps.owner && ownsGroup(st, ps.owner, sq.group);
    const rows = [['Аренда', sq.rent[0] + (mono && ps.houses === 0 ? ` (×2 = ${sq.rent[0] * 2})` : '')], ['С 1 хатой', sq.rent[1]], ['С 2 хатами', sq.rent[2]], ['С 3 хатами', sq.rent[3]], ['С 4 хатами', sq.rent[4]], ['С особняком', sq.rent[5]]];
    body = `<table>${rows.map((r, i) => `<tr class="${ps.owner && i === ps.houses ? 'now' : ''}"><td>${r[0]}</td><td>$${r[1]}</td></tr>`).join('')}</table>
      <div class="deed-foot"><span>Хата: ${money(sq.house)}</span><span>Залог: ${money(mortgageValue(idx))}</span><span>Группа: ${GROUPS[g].name}</span></div>`;
  } else if (sq.type === 'rail') {
    body = `<table>${RAIL_RENT.map((r, i) => `<tr class="${ps.owner && i === (BOARD.filter((s) => s.type === 'rail' && st.props[s.i].owner === ps.owner).length - 1) ? 'now' : ''}"><td>${i + 1} ${i === 0 ? 'точка' : i < 4 ? 'точки' : ''} у хозяина</td><td>$${r}</td></tr>`).join('')}</table>
      <div class="deed-foot"><span>Залог: ${money(mortgageValue(idx))}</span><span>Ломбард, ликёрка, барахолка, обнал</span></div>`;
  } else if (sq.type === 'util') {
    body = `<table><tr><td>1 салон у хозяина</td><td>кубики × 4</td></tr><tr><td>2 салона у хозяина</td><td>кубики × 10</td></tr></table>
      <div class="deed-foot"><span>Залог: ${money(mortgageValue(idx))}</span></div>`;
  } else {
    const texts = {
      go: 'Каждый раз, проходя СТАРТ, получаешь $200. Пособие пришло.',
      chance: 'Тянешь карту «No Chance». Шансов нет, но карту вытянуть придётся.',
      chest: 'Тянешь карту «Community Service». Общественные работы — дело общественное.',
      tax: sq.i === 4 ? 'Уклонение от налогов раскрыто: плати $200 или 10% от всего, что нажито.' : 'Ограбили. Отдай $100 и не делай резких движений.',
      jail: 'County Hospital. Проездом — просто навещаешь кореша. Если попал сюда по Drive-By — лежишь, пока не выбросишь дубль, не заплатишь $50 или не используешь карту выписки.',
      parking: st.settings.freeParkingPool ? 'Бесплатная парковка. Все штрафы и налоги копятся здесь — кто встал, тот и забрал.' : 'Бесплатная парковка. Можно выдохнуть.',
      gotojail: 'Drive-By. Поймал шальную — прямиком в County Hospital, СТАРТ не проходишь.',
    };
    body = `<div style="padding:12px;font-size:15px">${esc(texts[sq.type] || '')}</div>`;
  }
  const ownerLine = ps ? (ps.owner ? `Хозяин: <b style="color:${playerColor(st, ps.owner)}">${esc(pname(st, ps.owner))}</b>${ps.mortgaged ? ' · <span class="dn">под Disconnect Notice</span>' : ''}` : `Свободна · цена ${money(sq.price)}`) : '';
  let ctl = '';
  if (ps && viewer && ps.owner === viewer) {
    const b = (label, act, err) => `<button class="btn btn-sm" data-pact="${act}" data-idx="${idx}" ${err ? `disabled title="${esc(err)}"` : ''}>${label}</button>`;
    if (sq.type === 'prop') ctl += b(`Строить (${money(sq.house)})`, 'build', checks.canBuild(st, viewer, idx)) + b(`Продать постройку (+${money(Math.floor(sq.house / 2))})`, 'sell_house', checks.canSellHouse(st, viewer, idx));
    ctl += ps.mortgaged ? b(`Выкупить (${money(unmortgageCost(idx))})`, 'unmortgage', checks.canUnmortgage(st, viewer, idx)) : b(`Заложить (+${money(mortgageValue(idx))})`, 'mortgage', checks.canMortgage(st, viewer, idx));
  }
  return `<div class="deed ${ps && ps.mortgaged ? 'dn' : ''}" style="--gc:${gc};--gt:${gt}"><div class="deed-head">${esc(sq.name)}</div>${body}</div>
    <div class="sub">${ownerLine}</div>${ctl ? `<div class="actions">${ctl}</div>` : ''}`;
}

export function cardHtml(st, forHuman) {
  const card = st.card && CARD_BY_ID[st.card.id];
  if (!card) return '';
  const deck = st.card.deck;
  const p = current(st);
  return `<div class="big-card ${deck}"><div class="kind">${deck === 'chance' ? 'NO CHANCE' : 'COMMUNITY SERVICE'}<small>${esc(p.name)} тянет карту</small></div><div class="text">${esc(card.text)}</div></div>
    ${forHuman ? '<div class="actions"><button class="btn btn-primary" data-act="ack_card">Ок</button></div>' : '<div class="sub">…</div>'}`;
}
export function taxHtml(st) {
  const p = current(st);
  const sq = BOARD[p.pos];
  const pct = Math.floor(netWorth(st, p.id) * sq.percent / 100);
  return `<h2>Tax Evasion</h2><div class="sub">Налоговая всё-таки нашла ${esc(p.name)}. Общая стоимость имущества: ${money(netWorth(st, p.id))}.</div>
    <div class="actions"><button class="btn btn-primary" data-act="tax" data-mode="flat">Заплатить ${money(sq.amount)}</button><button class="btn ${pct < sq.amount ? 'btn-gold' : ''}" data-act="tax" data-mode="percent">Заплатить ${sq.percent}% = ${money(pct)}</button></div>`;
}

export function auctionHtml(st, ctx) {
  const a = st.auction;
  const sq = BOARD[a.idx];
  const turn = st.players.find((p) => p.id === a.turnPid);
  const mine = turn && ctx.isHuman(turn.id);
  const hi = a.highest ? `${money(a.highest.amount)} — ${esc(pname(st, a.highest.pid))}` : 'ставок нет';
  const list = a.active.map((pid) => `<div class="${ctx.isHuman(pid) ? 'you' : ''}">${esc(pname(st, pid))}: ${a.passed.includes(pid) ? 'пас' : a.bids[pid] ? money(a.bids[pid]) : '—'}</div>`).join('');
  const min = a.highest ? a.highest.amount + 1 : 1;
  const steps = [10, 50, 100].map((s) => { const v = (a.highest ? a.highest.amount : 0) + s; return `<button class="btn" data-act="bid" data-amount="${v}" ${v > turn.cash ? 'disabled' : ''}>+${s} → ${money(v)}</button>`; }).join('');
  return `<h2>Аукцион: ${esc(sq.name)}</h2><div class="sub">Цена по прайсу ${money(sq.price)} · лучшая ставка: <b>${hi}</b></div>
    ${squareHtml(st, a.idx, null).split('<div class="sub">')[0]}
    <div class="auction-bids">${list}</div>
    ${mine ? `<div class="sub">Твой ход, ${esc(turn.name)} (в кармане ${money(turn.cash)}). Минимум ${money(min)}.</div><div class="actions">${steps}<button class="btn" data-act="bid_custom">Своя сумма</button><button class="btn btn-danger" data-act="pass">Пас</button></div>` : `<div class="sub">Ход: ${esc(turn ? turn.name : '')}…</div>`}`;
}

export function incomingTradeHtml(st, ctx) {
  const t = st.trade;
  const to = st.players.find((p) => p.id === t.to);
  const side = (part, who) => `<div class="trade-col"><h3>${esc(pname(st, who))} отдаёт</h3>${part.cash ? `<div>💵 ${money(part.cash)}</div>` : ''}${part.props.map((i) => `<div class="row"><span class="sw" style="--gc:${colorOf(i)};width:10px;height:20px;border-radius:2px;background:var(--gc)"></span>${esc(BOARD[i].name)}${st.props[i].mortgaged ? ' <span class="dn">(DN)</span>' : ''}</div>`).join('')}${part.cards ? `<div>🏥 карты выписки ×${part.cards}</div>` : ''}${!part.cash && !part.props.length && !part.cards ? '<div class="sub">ничего</div>' : ''}</div>`;
  const canAnswer = ctx.isHuman(t.to);
  const canCancel = ctx.isHuman(t.from);
  return `<h2>Сделка от ${esc(pname(st, t.from))}</h2><div class="sub">Предложение игроку <b>${esc(to.name)}</b></div><div class="trade-cols">${side(t.give, t.from)}${side(t.get, t.to)}</div>
    ${canAnswer ? `<div class="actions"><button class="btn btn-danger" data-act="trade_reject">Отклонить</button><button class="btn btn-primary" data-act="trade_accept">Принять</button></div>` : canCancel ? `<div class="actions"><button class="btn" data-act="trade_cancel">Отозвать</button></div><div class="sub">Ждём ответа…</div>` : '<div class="sub">Ждём ответа…</div>'}`;
}

export function colorOf(idx) { const sq = BOARD[idx]; return sq.type === 'prop' ? GROUPS[sq.group].color : sq.type === 'rail' ? '#2b2b2b' : '#8a8f99'; }

export function propItemHtml(st, idx, viewer, withCtl) {
  const sq = BOARD[idx]; const ps = st.props[idx];
  const houses = sq.type === 'prop' ? `<span class="houses">${ps.houses === MAX_HOUSES ? '<i class="hotel"></i>' : '<i></i>'.repeat(ps.houses)}</span>` : '';
  let ctl = '';
  if (withCtl && viewer && ps.owner === viewer) {
    const b = (label, act, err) => `<button class="btn btn-xs" data-pact="${act}" data-idx="${idx}" ${err ? `disabled title="${esc(err)}"` : ''}>${label}</button>`;
    if (sq.type === 'prop') ctl += b('+🏠', 'build', checks.canBuild(st, viewer, idx)) + b('−🏠', 'sell_house', checks.canSellHouse(st, viewer, idx));
    ctl += ps.mortgaged ? b(`Выкупить ${money(unmortgageCost(idx))}`, 'unmortgage', checks.canUnmortgage(st, viewer, idx)) : b(`Заложить +${money(mortgageValue(idx))}`, 'mortgage', checks.canMortgage(st, viewer, idx));
  }
  return `<div class="item ${ps.mortgaged ? 'off' : ''}" data-open="${idx}"><span class="sw" style="--gc:${colorOf(idx)}"></span><div class="t">${esc(sq.name)}${houses}<small>${ps.mortgaged ? '<span class="dn">Disconnect Notice</span> · ' : ''}${sq.type === 'prop' ? `аренда ${money(rentFor(st, idx, 7) || sq.rent[0])}` : sq.type === 'rail' ? `аренда ${money(rentFor(st, idx, 7) || 25)}` : 'салон'}</small></div><div class="ctl">${ctl}</div></div>`;
}

export function manageHtml(st, pid, debt) {
  const p = st.players.find((x) => x.id === pid);
  const owned = ownedBy(st, pid).sort((a, b) => a - b);
  const head = debt ? `<h2>Долг ${money(debt.amount)}</h2><div class="sub">В кармане ${money(p.cash)}. Не хватает <b>${money(Math.max(0, debt.amount - p.cash))}</b>. Заложи клетки или продай постройки — как только денег хватит, долг спишется сам. Всего можно выручить: ${money(liquidValue(st, pid))}.</div>` : `<h2>Имущество: ${esc(p.name)}</h2><div class="sub">Наличные ${money(p.cash)} · всего ${money(netWorth(st, pid))}${p.jailCards.length ? ` · карты выписки ×${p.jailCards.length}` : ''}</div>`;
  const list = owned.length ? owned.map((i) => propItemHtml(st, i, pid, true)).join('') : '<div class="sub">Пока ничего. Покупай клетки, на которые встал.</div>';
  return `${head}<div class="list">${list}</div>${debt ? '' : '<div class="actions"><button class="btn" data-close="1">Закрыть</button></div>'}`;
}

export function playerHtml(st, pid, viewerPid) {
  const p = st.players.find((x) => x.id === pid);
  const owned = ownedBy(st, pid).sort((a, b) => a - b);
  return `<h2><span class="tok" style="display:inline-grid;place-items:center;width:34px;height:34px;border-radius:50%;background:radial-gradient(circle at 35% 30%, #fbe28f, var(--gold) 70%);border:2px solid ${playerColor(st, pid)};font-size:18px">${tokenOf(p.token).emoji}</span> ${esc(p.name)} ${p.bot ? '🤖' : ''}</h2>
    <div class="sub">${p.bankrupt ? 'Банкрот' : `Наличные ${money(p.cash)} · имущество ${money(netWorth(st, pid))}`}${p.inJail ? ' · в County Hospital' : ''}${p.jailCards.length ? ` · карты выписки ×${p.jailCards.length}` : ''} · клетка: ${esc(BOARD[p.pos].name)}</div>
    <div class="list">${owned.length ? owned.map((i) => propItemHtml(st, i, viewerPid, viewerPid === pid)).join('') : '<div class="sub">Нет имущества</div>'}</div>
    <div class="actions"><button class="btn" data-close="1">Закрыть</button></div>`;
}

export function logHtml(st, me) {
  return `<h2>Журнал</h2><div class="log">${st.log.slice().reverse().map((l) => `<div class="${l.p && l.p === me ? 'me' : ''}">${esc(l.t)}</div>`).join('')}</div><div class="actions"><button class="btn" data-close="1">Закрыть</button></div>`;
}

export function tradeBuilderHtml(st, me) {
  const others = st.players.filter((p) => p.id !== me && !p.bankrupt);
  const mine = ownedBy(st, me);
  const meP = st.players.find((p) => p.id === me);
  const to = others[0];
  const propChecks = (list, name) => list.map((i) => `<label class="check"><input type="checkbox" name="${name}" value="${i}"><span class="sw" style="--gc:${colorOf(i)}"></span>${esc(BOARD[i].name)}${st.props[i].mortgaged ? ' (DN)' : ''}</label>`).join('') || '<div class="sub">нет клеток</div>';
  return `<h2>Сделка</h2>
    <div class="field"><label>С кем</label><select class="input" id="trade-to">${others.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></div>
    <div class="trade-cols">
      <div class="trade-col"><h3>Ты отдаёшь</h3><input class="input" id="give-cash" type="number" inputmode="numeric" min="0" max="${meP.cash}" placeholder="$ наличные" value=""><div id="give-props">${propChecks(mine, 'give')}</div>${meP.jailCards.length ? `<label class="check"><input type="checkbox" id="give-card">🏥 карта выписки</label>` : ''}</div>
      <div class="trade-col"><h3>Ты получаешь</h3><input class="input" id="get-cash" type="number" inputmode="numeric" min="0" placeholder="$ наличные" value=""><div id="get-props"></div><label class="check" id="get-card-wrap" hidden><input type="checkbox" id="get-card">🏥 карта выписки</label></div>
    </div>
    <div class="actions"><button class="btn" data-close="1">Отмена</button><button class="btn btn-primary" id="trade-send">Предложить</button></div>`;
}

export function gameOverHtml(st) {
  const w = st.players.find((p) => p.id === st.winner);
  const rows = st.players.slice().sort((a, b) => (b.bankrupt ? -1 : netWorth(st, b.id)) - (a.bankrupt ? -1 : netWorth(st, a.id)));
  return `<div class="winner"><div class="crown">👑</div><div class="wname">${esc(w ? w.name : '')}</div><div class="sub">Последний на районе. Ход ${st.turnNo}.</div></div>
    <table class="stats">${rows.map((p) => `<tr><td>${tokenOf(p.token).emoji} ${esc(p.name)}</td><td>${p.bankrupt ? 'банкрот' : money(netWorth(st, p.id))}</td></tr>`).join('')}</table>
    <div class="actions"><button class="btn" data-close="1">Посмотреть доску</button><button class="btn btn-primary" data-act="to_menu">В меню</button></div>`;
}

export function rulesHtml() {
  return `<div class="rules">
    <p>Po'Nopoly — пародийная «Монополия» из фильма «Не грози Южному Централу, попивая сок у себя в квартале» (1996). Правила классические, названия — с той самой доски.</p>
    <h3>Цель</h3><p>Остаться последним, кто не обанкротился.</p>
    <h3>Ход</h3><ul><li>Бросаешь два кубика и идёшь по часовой стрелке. Дубль — ходишь ещё раз; три дубля подряд — в County Hospital.</li><li>Проходя СТАРТ, получаешь $200.</li><li>Встал на свободную клетку — можешь купить. Отказался — клетка уходит на аукцион.</li><li>Встал на чужую — платишь аренду. Полная цветовая группа без построек удваивает аренду.</li></ul>
    <h3>Клетки с доски</h3><ul><li><b>No Chance</b> и <b>Community Service</b> — колоды карточек.</li><li><b>Tax Evasion</b> — $200 или 10% от всего имущества, на выбор.</li><li><b>Robbed</b> — минус $100.</li><li><b>Drive-By</b> — прямиком в County Hospital. Выйти: дубль, $50 или карта выписки. С третьей попытки платишь $50 и выходишь.</li><li><b>Pawn Shop, Liquor Store, Swap Meet, Check Cashing</b> — «точки», аренда растёт с их количеством: $25 / $50 / $100 / $200.</li><li><b>Nail Salon, Barbershop</b> — аренда = кубики × 4 (× 10, если оба у одного хозяина).</li></ul>
    <h3>Постройки</h3><ul><li>Собрал всю цветовую группу — строишь хаты (до четырёх), пятая постройка — особняк. Строить нужно равномерно по группе.</li><li>Постройки продаются банку за полцены.</li></ul>
    <h3>Disconnect Notice (залог)</h3><ul><li>Клетку без построек можно заложить за половину цены — аренда с неё не берётся. Выкуп: залог + 10%.</li></ul>
    <h3>Долги и банкротство</h3><ul><li>Не хватает денег — закладывай и продавай. Если выручить нужную сумму не получается, объявляешь банкротство: имущество уходит кредитору.</li></ul>
    <h3>Сделки</h3><ul><li>В свой ход можно предложить любому игроку обмен: деньги, клетки, карты выписки. Клетки с постройками не обмениваются.</li></ul>
  </div>`;
}
