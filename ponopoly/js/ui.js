// Рендер доски, панелей и модальных окон. Ничего не знает о правилах — только показывает state.
import { BOARD, N, SIDE, GROUPS, TOKENS, PLAYER_COLORS, RAIL_RENT, MAX_HOUSES, JAIL_FINE, CARD_BY_ID, groupOf, sqName, sqShort, term, cardText, deckName, langOf } from './data.js';
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
// Простые оригинальные пиктограммы для особых клеток (в духе рисунков на реквизите).
const ICON = {
  gun: '<svg viewBox="0 0 64 40" aria-hidden="true"><path d="M2 8h46l6-4h8v10h-6l-3 4H34l-2 6h-8l-2-6h-4l-4 14h-9l5-14H2z" fill="currentColor"/></svg>',
  chain: '<svg viewBox="0 0 64 44" aria-hidden="true"><circle cx="16" cy="28" r="14" fill="currentColor"/><path d="M28 22c6-8 12-8 18-2M46 20c6-6 10-4 14-2" stroke="currentColor" stroke-width="4" fill="none" stroke-linecap="round"/><rect x="44" y="8" width="10" height="8" rx="4" fill="none" stroke="currentColor" stroke-width="3"/><rect x="54" y="14" width="8" height="7" rx="3.5" fill="none" stroke="currentColor" stroke-width="3"/></svg>',
  car: '<svg viewBox="0 0 64 36" aria-hidden="true"><path d="M8 24l6-12h30l10 12v6H8z" fill="currentColor"/><circle cx="18" cy="30" r="5" fill="#fff" stroke="currentColor" stroke-width="3"/><circle cx="46" cy="30" r="5" fill="#fff" stroke="currentColor" stroke-width="3"/><path d="M58 8l4-6M62 14l6-2" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>',
  cross: '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M14 2h12v12h12v12H26v12H14V26H2V14h12z" fill="#d8242a"/></svg>',
  arrow: '<svg viewBox="0 0 64 32" aria-hidden="true"><path d="M2 10h40V2l20 14-20 14v-8H2z" fill="currentColor"/></svg>',
  pawn: '<svg viewBox="0 0 64 40" aria-hidden="true"><circle cx="14" cy="26" r="11" fill="currentColor"/><circle cx="50" cy="26" r="11" fill="currentColor"/><circle cx="32" cy="12" r="11" fill="currentColor"/></svg>',
  bottle: '<svg viewBox="0 0 32 64" aria-hidden="true"><path d="M12 2h8v14c6 4 8 8 8 14v30a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V30c0-6 2-10 8-14z" fill="currentColor"/><rect x="8" y="34" width="16" height="12" fill="#fff" opacity=".7"/></svg>',
  tag: '<svg viewBox="0 0 64 48" aria-hidden="true"><path d="M4 4h28l28 22-16 18L4 32z" fill="currentColor"/><circle cx="14" cy="14" r="4" fill="#fff"/></svg>',
  bill: '<svg viewBox="0 0 64 36" aria-hidden="true"><rect x="2" y="2" width="60" height="32" rx="3" fill="currentColor"/><ellipse cx="32" cy="18" rx="10" ry="12" fill="#fff" opacity=".8"/><text x="32" y="23" font-size="14" text-anchor="middle" font-family="sans-serif" font-weight="700" fill="currentColor">$</text></svg>',
  nails: '<svg viewBox="0 0 40 64" aria-hidden="true"><rect x="14" y="2" width="12" height="14" rx="2" fill="currentColor"/><path d="M8 20h24l2 38a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4z" fill="currentColor"/><path d="M12 30h16l1 24H11z" fill="#e4489a"/></svg>',
  pole: '<svg viewBox="0 0 24 64" aria-hidden="true"><rect x="4" y="6" width="16" height="52" rx="6" fill="#fff" stroke="currentColor" stroke-width="2"/><path d="M4 14l16-6M4 26l16-6M4 38l16-6M4 50l16-6" stroke="#d8242a" stroke-width="4"/><path d="M4 20l16-6M4 32l16-6M4 44l16-6" stroke="#2a5db8" stroke-width="4"/></svg>',
  parking: '<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="2" y="2" width="36" height="36" rx="4" fill="#2a5db8"/><text x="20" y="31" font-size="30" text-anchor="middle" font-family="Arial Black,sans-serif" font-weight="900" fill="#fff">P</text></svg>',
};
export const ICON_BY_SQUARE = (sq) => {
  switch (sq.type) {
    case 'go': return ICON.arrow;
    case 'jail': return ICON.cross;
    case 'parking': return ICON.parking;
    case 'gotojail': return ICON.car;
    case 'driveby': return ICON.gun;
    case 'tax': return sq.percent ? '' : ICON.gun;
    case 'chest': return ICON.chain;
    case 'rail': return { 'Pawn Shop': ICON.pawn, 'Liquor Store': ICON.bottle, 'Swap Meet': ICON.tag, 'Check Cashing': ICON.bill }[sq.name] || ICON.tag;
    case 'util': return sq.name === 'Barbershop' ? ICON.pole : ICON.nails;
    default: return '';
  }
};

export function dnTag(st) { return langOf(st) === 'ru' ? '(в залоге)' : '(DN)'; }

export function buildBoard(boardEl, lang = 'en') {
  boardEl.innerHTML = '';
  boardEl.setAttribute('aria-label', `Доска ${term(lang, 'logo')}`);
  boardEl.dataset.lang = lang;
  const cells = [];
  for (const sq of BOARD) {
    const el = document.createElement('div');
    const pos = gridPos(sq.i);
    el.className = `cell sq-${sq.type} ${pos.side}${sq.seen ? ' seen' : ''}`;
    el.style.gridRow = pos.row; el.style.gridColumn = pos.col;
    el.dataset.idx = sq.i;
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', sqName(lang, sq.i));
    const g = groupOf(sq);
    if (g) el.style.setProperty('--gc', GROUPS[g].color);
    const name = esc(sqShort(lang, sq.i));
    let body = '';
    if (sq.type === 'prop') {
      body = `<div class="band"></div><div class="body"><div class="name">${name}</div><div class="price">$${sq.price}</div></div>`;
    } else if (sq.type === 'rail' || sq.type === 'util') {
      body = `<div class="band"></div><div class="body"><div class="name">${name}</div><div class="ico">${ICON_BY_SQUARE(sq)}</div><div class="price">$${sq.price}</div></div>`;
    } else if (sq.type === 'chance') {
      body = `<div class="band none"></div><div class="body"><div class="name">${name}</div><div class="ico q">?</div></div>`;
    } else if (sq.type === 'chest') {
      body = `<div class="band none"></div><div class="body"><div class="name">${name}</div><div class="ico">${ICON.chain}</div></div>`;
    } else if (sq.type === 'tax' && sq.percent) {
      body = `<div class="band none"></div><div class="body"><div class="name">${name}</div><div class="diamond">◆</div><div class="sub">${lang === 'ru' ? '10% ИЛИ $' + sq.amount : 'PAY 10% OR $' + sq.amount}</div></div>`;
    } else if (sq.type === 'tax') {
      body = `<div class="band none"></div><div class="body"><div class="ico">${ICON.gun}</div><div class="name">${name}</div><div class="sub">${lang === 'ru' ? 'ОТДАЙ $' + sq.amount : 'HAND OVER $' + sq.amount}</div></div>`;
    } else if (sq.type === 'driveby') {
      body = `<div class="band none"></div><div class="body"><div class="ico">${ICON.gun}</div><div class="name">${name}</div><div class="sub">${lang === 'ru' ? 'ПРОПУСК ХОДА' : 'LOSE A TURN'}</div></div>`;
    } else {
      // углы
      const sub = sq.type === 'go' ? (lang === 'ru' ? 'ПОЛУЧИ $200' : 'COLLECT $200') : sq.type === 'jail' ? (lang === 'ru' ? 'ПРОЕЗДОМ' : 'JUST VISITING') : sq.type === 'gotojail' ? (lang === 'ru' ? 'В БОЛЬНИЦУ' : 'GO TO HOSPITAL') : '';
      body = `<div class="body corner-body"><div class="ico">${ICON_BY_SQUARE(sq)}</div><div class="name">${name}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;
    }
    el.innerHTML = body;
    boardEl.appendChild(el);
    cells[sq.i] = el;
  }
  const center = document.createElement('div');
  center.className = 'center';
  center.innerHTML = `
    ${mascotSvg()}
    <div class="logo-box">${esc(term(lang, 'logo'))}</div>
    <div class="logo-sub">${esc(term(lang, 'logoSub'))}</div>
    <div class="fineprint">${lang === 'ru' ? 'Пародийная настолка по мотивам фильма «Не грози Южному Централу». Любое сходство с настоящими районами — не случайность.' : 'A parody board game inspired by the hood. Any resemblance to real neighborhoods is entirely intentional.'}</div>
    <div class="deck chance"><span>${esc(term(lang, 'chance'))}</span></div>
    <div class="deck chest"><span>${esc(term(lang, 'chest'))}</span></div>
    <div class="dice" id="dice"><div class="die" data-v="0">${'<span></span>'.repeat(9)}</div><div class="die" data-v="0">${'<span></span>'.repeat(9)}</div></div>
    <div class="status" id="board-status">Бросай кубики</div>`;
  boardEl.appendChild(center);
  const tokens = document.createElement('div');
  tokens.className = 'tokens'; tokens.id = 'tokens';
  boardEl.appendChild(tokens);
  return { boardEl, cells, center, tokens, dice: center.querySelectorAll('.die'), status: $('#board-status', center), lang };
}

// Позиция клетки в сетке (SIDE клеток на сторону вместе с углом). GO — правый нижний угол,
// ход против часовой стрелки: низ справа налево, левый столбец снизу вверх, верх слева направо, правый столбец сверху вниз.
function gridPos(i) {
  const G = SIDE + 1; // 13×13
  const side = Math.floor(i / SIDE), k = i % SIDE;
  if (side === 0) return k === 0 ? { row: G, col: G, side: 'corner' } : { row: G, col: G - k, side: 'side-bottom' };
  if (side === 1) return k === 0 ? { row: G, col: 1, side: 'corner' } : { row: G - k, col: 1, side: 'side-left' };
  if (side === 2) return k === 0 ? { row: 1, col: 1, side: 'corner' } : { row: 1, col: 1 + k, side: 'side-top' };
  return k === 0 ? { row: 1, col: G, side: 'corner' } : { row: 1 + k, col: G, side: 'side-right' };
}

function mascotSvg() {
  // Оригинальный персонаж: парень в бини и тёмных очках с золотой цепью, кидает кубики.
  return `<svg class="mascot" viewBox="0 0 120 100" aria-hidden="true">
    <circle cx="50" cy="48" r="26" fill="#7a4b2a"/>
    <path d="M24 40 Q50 14 76 40 L76 46 Q50 36 24 46 Z" fill="#1a2a35"/>
    <rect x="24" y="40" width="52" height="7" rx="3" fill="#2d6e3a"/>
    <rect x="28" y="48" width="18" height="9" rx="2" fill="#111"/><rect x="54" y="48" width="18" height="9" rx="2" fill="#111"/><rect x="46" y="50" width="8" height="3" fill="#111"/>
    <path d="M40 66 Q50 74 60 66" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M30 76 Q50 96 70 76" stroke="#d9a521" stroke-width="4" fill="none"/>
    <circle cx="50" cy="86" r="5" fill="#d9a521"/>
    <path d="M78 60 q14 -8 22 2" stroke="#7a4b2a" stroke-width="8" fill="none" stroke-linecap="round"/>
    <rect x="92" y="40" width="14" height="14" rx="2" fill="#d8242a" transform="rotate(14 99 47)"/><circle cx="99" cy="47" r="1.8" fill="#fff"/>
    <rect x="104" y="56" width="12" height="12" rx="2" fill="#d8242a" transform="rotate(-18 110 62)"/><circle cx="107" cy="59" r="1.5" fill="#fff"/><circle cx="113" cy="65" r="1.5" fill="#fff"/>
  </svg>`;
}

export function renderBoard(st, refs) {
  for (const sq of BOARD) {
    const el = refs.cells[sq.i];
    const ps = st.props[sq.i];
    if (!ps) continue;
    el.classList.toggle('mortgaged', !!ps.mortgaged);
    el.classList.toggle('owned', !!ps.owner);
    if (ps.owner) { el.style.setProperty('--oc', playerColor(st, ps.owner)); el.title = `${sqName(st, sq.i)} — ${pname(st, ps.owner)}`; } else { el.style.removeProperty('--oc'); el.title = sqName(st, sq.i); }
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
  if (ev.mode === 'forward') { let i = ev.from; while (i !== ev.to) { i = (i + 1) % N; path.push(i); } if (!path.length) path = [ev.to]; }
  else if (ev.mode === 'back') { let i = ev.from; while (i !== ev.to) { i = (i + N - 1) % N; path.push(i); } }
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
    chip.innerHTML = `<span class="tok">${tokenOf(p.token).emoji}</span><span><span class="pname">${esc(p.name)}</span>${p.bot ? ' <span class="pbot">🤖</span>' : ''}${p.inJail ? ` <span class="pjail" title="${esc(term(st, 'hospital'))}">🏥</span>` : ''}<br><span class="pcash${delta > 0 ? ' flash-up' : delta < 0 ? ' flash-down' : ''}">${p.bankrupt ? 'банкрот' : money(p.cash)}</span></span>`;
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
          status = `<span>${you}${cap(`ты ${term(st, 'hospitalAt')} (попытка ${p.jailTurns + 1}/3)`)}</span>`;
          main = btn('🎲 Бросить', 'btn-primary', 'roll', { pulse: true }) + (legal.includes('jail_pay') ? btn(`Заплатить ${money(JAIL_FINE)}`, '', 'jail_pay') : '') + (legal.includes('jail_card') ? btn('Карта выписки', 'btn-gold', 'jail_card') : '');
        } else {
          status = `<span>${you}${cap(st.doubles > 0 ? 'дубль — бросай ещё' : 'твой ход')}</span>`;
          main = btn('🎲 Бросить кубики', 'btn-primary', 'roll', { pulse: true });
        }
        break;
      case PHASE.BUY: {
        const sq = BOARD[p.pos];
        status = `<span>${you}${esc(sqName(st, p.pos))} свободна</span>`;
        main = btn(`Купить за ${money(sq.price)}`, 'btn-gold', 'buy', { disabled: !legal.includes('buy') }) + btn(st.settings.auctions ? 'На аукцион' : 'Не покупать', '', 'skip_buy');
        break;
      }
      case PHASE.TAX: status = `<span>${you}${esc(term(st, 'tax'))}</span>`; main = btn('Выбрать, сколько платить', 'btn-primary', 'tax_modal'); break;
      case PHASE.CARD: status = `<span>${you}${cap('карта')}</span>`; main = btn('Показать карту', 'btn-primary', 'card_modal'); break;
      case PHASE.DEBT:
        status = `<span>${you}<span class="debt">${cap('долг')} ${money(st.debt.amount)}</span>, в кармане ${money(p.cash)}</span>`;
        main = btn('Добыть деньги', 'btn-primary', 'manage', { pulse: true }) + btn('Банкрот', 'btn-danger', 'bankrupt', { disabled: liquidValue(st, p.id) >= st.debt.amount });
        break;
      case PHASE.AUCTION: status = `<span>${you}${cap('аукцион')} за ${esc(sqName(st, st.auction.idx))}</span>`; main = btn('К торгам', 'btn-primary', 'auction_modal', { pulse: true }); break;
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
      <div class="deed-foot"><span>Залог: ${money(mortgageValue(idx))}</span><span>${BOARD.filter((s) => s.type === 'rail').map((s) => esc(sqName(st, s.i))).join(', ')}</span></div>`;
  } else if (sq.type === 'util') {
    body = `<table><tr><td>1 салон у хозяина</td><td>кубики × 4</td></tr><tr><td>2 салона у хозяина</td><td>кубики × 10</td></tr></table>
      <div class="deed-foot"><span>Залог: ${money(mortgageValue(idx))}</span></div>`;
  } else {
    const texts = {
      go: 'Каждый раз, проходя СТАРТ, получаешь $200. Пособие пришло.',
      chance: `Тянешь карту «${term(st, 'chanceShort')}». Шансов нет, но карту вытянуть придётся.`,
      chest: `Тянешь карту «${term(st, 'chestShort')}». Общественные работы — дело общественное.`,
      tax: sq.i === 4 ? 'Уклонение от налогов раскрыто: плати $200 или 10% от всего, что нажито.' : 'Ограбили. Отдай $100 и не делай резких движений.',
      jail: `${term(st, 'hospital')}. Проездом — просто навещаешь кореша. Если попал сюда с клетки «${term(st, 'driveby')}» — лежишь, пока не выбросишь дубль, не заплатишь $50 или не используешь карту выписки.`,
      parking: st.settings.freeParkingPool ? 'Бесплатная парковка. Все штрафы и налоги копятся здесь — кто встал, тот и забрал.' : 'Бесплатная парковка. Можно выдохнуть.',
      gotojail: `${term(st, 'driveby')}. Поймал шальную — прямиком ${term(st, 'hospitalIn')}, СТАРТ не проходишь.`,
    };
    body = `<div style="padding:12px;font-size:15px">${esc(texts[sq.type] || '')}</div>`;
  }
  const ownerLine = ps ? (ps.owner ? `Хозяин: <b style="color:${playerColor(st, ps.owner)}">${esc(pname(st, ps.owner))}</b>${ps.mortgaged ? ` · <span class="dn">${esc(term(st, 'dnUnder'))}</span>` : ''}` : `Свободна · цена ${money(sq.price)}`) : '';
  let ctl = '';
  if (ps && viewer && ps.owner === viewer) {
    const b = (label, act, err) => `<button class="btn btn-sm" data-pact="${act}" data-idx="${idx}" ${err ? `disabled title="${esc(err)}"` : ''}>${label}</button>`;
    if (sq.type === 'prop') ctl += b(`Строить (${money(sq.house)})`, 'build', checks.canBuild(st, viewer, idx)) + b(`Продать постройку (+${money(Math.floor(sq.house / 2))})`, 'sell_house', checks.canSellHouse(st, viewer, idx));
    ctl += ps.mortgaged ? b(`Выкупить (${money(unmortgageCost(idx))})`, 'unmortgage', checks.canUnmortgage(st, viewer, idx)) : b(`Заложить (+${money(mortgageValue(idx))})`, 'mortgage', checks.canMortgage(st, viewer, idx));
  }
  return `<div class="deed ${ps && ps.mortgaged ? 'dn' : ''}" data-stamp="${esc(term(st, 'dnStamp'))}" style="--gc:${gc};--gt:${gt}"><div class="deed-head">${esc(sqName(st, idx))}</div>${body}</div>
    <div class="sub">${ownerLine}</div>${ctl ? `<div class="actions">${ctl}</div>` : ''}`;
}

export function cardHtml(st, forHuman) {
  const card = st.card && CARD_BY_ID[st.card.id];
  if (!card) return '';
  const deck = st.card.deck;
  const p = current(st);
  return `<div class="big-card ${deck}"><div class="kind">${esc(deckName(st, deck))}<small>${esc(p.name)} тянет карту</small></div><div class="text">${esc(cardText(st, card))}</div></div>
    ${forHuman ? '<div class="actions"><button class="btn btn-primary" data-act="ack_card">Ок</button></div>' : '<div class="sub">…</div>'}`;
}
export function taxHtml(st) {
  const p = current(st);
  const sq = BOARD[p.pos];
  const pct = Math.floor(netWorth(st, p.id) * sq.percent / 100);
  return `<h2>${esc(term(st, 'tax'))}</h2><div class="sub">Налоговая всё-таки нашла ${esc(p.name)}. Общая стоимость имущества: ${money(netWorth(st, p.id))}.</div>
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
  return `<h2>Аукцион: ${esc(sqName(st, a.idx))}</h2><div class="sub">Цена по прайсу ${money(sq.price)} · лучшая ставка: <b>${hi}</b></div>
    ${squareHtml(st, a.idx, null).split('<div class="sub">')[0]}
    <div class="auction-bids">${list}</div>
    ${mine ? `<div class="sub">Твой ход, ${esc(turn.name)} (в кармане ${money(turn.cash)}). Минимум ${money(min)}.</div><div class="actions">${steps}<button class="btn" data-act="bid_custom">Своя сумма</button><button class="btn btn-danger" data-act="pass">Пас</button></div>` : `<div class="sub">Ход: ${esc(turn ? turn.name : '')}…</div>`}`;
}

export function incomingTradeHtml(st, ctx) {
  const t = st.trade;
  const to = st.players.find((p) => p.id === t.to);
  const side = (part, who) => `<div class="trade-col"><h3>${esc(pname(st, who))} отдаёт</h3>${part.cash ? `<div>💵 ${money(part.cash)}</div>` : ''}${part.props.map((i) => `<div class="row"><span class="sw" style="--gc:${colorOf(i)};width:10px;height:20px;border-radius:2px;background:var(--gc)"></span>${esc(sqName(st, i))}${st.props[i].mortgaged ? ` <span class="dn">${dnTag(st)}</span>` : ''}</div>`).join('')}${part.cards ? `<div>🏥 карты выписки ×${part.cards}</div>` : ''}${!part.cash && !part.props.length && !part.cards ? '<div class="sub">ничего</div>' : ''}</div>`;
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
  return `<div class="item ${ps.mortgaged ? 'off' : ''}" data-open="${idx}"><span class="sw" style="--gc:${colorOf(idx)}"></span><div class="t">${esc(sqName(st, idx))}${houses}<small>${ps.mortgaged ? `<span class="dn">${esc(term(st, 'dn'))}</span> · ` : ''}${sq.type === 'prop' ? `аренда ${money(rentFor(st, idx, 7) || sq.rent[0])}` : sq.type === 'rail' ? `аренда ${money(rentFor(st, idx, 7) || 25)}` : 'салон'}</small></div><div class="ctl">${ctl}</div></div>`;
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
    <div class="sub">${p.bankrupt ? 'Банкрот' : `Наличные ${money(p.cash)} · имущество ${money(netWorth(st, pid))}`}${p.inJail ? ` · ${term(st, 'hospitalAt')}` : ''}${p.jailCards.length ? ` · карты выписки ×${p.jailCards.length}` : ''} · клетка: ${esc(sqName(st, p.pos))}</div>
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
  const propChecks = (list, name) => list.map((i) => `<label class="check"><input type="checkbox" name="${name}" value="${i}"><span class="sw" style="--gc:${colorOf(i)}"></span>${esc(sqName(st, i))}${st.props[i].mortgaged ? ` ${dnTag(st)}` : ''}</label>`).join('') || '<div class="sub">нет клеток</div>';
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

export function rulesHtml(lang = 'en') {
  const n = (i) => esc(sqName(lang, i));
  const t = (k) => esc(term(lang, k));
  return `<div class="rules">
    <p>${t('logo')} — пародийная «Монополия» из фильма «Не грози Южному Централу, попивая сок у себя в квартале» (1996). Правила классические, названия — с той самой доски${lang === 'ru' ? ', переведённые на русский' : ''}.</p>
    <h3>Цель</h3><p>Остаться последним, кто не обанкротился.</p>
    <h3>Ход</h3><ul><li>Бросаешь два кубика и идёшь по часовой стрелке. Дубль — ходишь ещё раз; три дубля подряд — ${t('hospitalIn')}.</li><li>Проходя СТАРТ, получаешь $200.</li><li>Встал на свободную клетку — можешь купить. Отказался — клетка уходит на аукцион.</li><li>Встал на чужую — платишь аренду. Полная цветовая группа без построек удваивает аренду.</li></ul>
    <h3>Клетки с доски</h3><ul><li><b>${t('chanceShort')}</b> и <b>${t('chestShort')}</b> — колоды карточек.</li><li><b>${t('tax')}</b> — $200 или 10% от всего имущества, на выбор.</li><li><b>${t('robbed')}</b> — минус $100.</li><li><b>${t('hospital')}</b> — лежишь, пока не выбросишь дубль, не заплатишь $50 или не используешь карту выписки. С третьей попытки платишь $50 и выходишь.</li><li><b>${BOARD.filter((s) => s.type === 'rail').map((s) => n(s.i)).join(', ')}</b> — «точки», аренда растёт с их количеством: $25 / $50 / $100 / $200.</li><li><b>${BOARD.filter((s) => s.type === 'util').map((s) => n(s.i)).join(', ')}</b> — аренда = кубики × 4 (× 10, если оба у одного хозяина).</li><li><b>${t('driveby')}</b> — попал под обстрел: пропускаешь следующий ход.</li><li><b>${t('carjack')}</b> — угнали тачку: прямиком ${t('hospitalIn')}.</li></ul>
    <h3>Постройки</h3><ul><li>Собрал всю цветовую группу — строишь хаты (до четырёх), пятая постройка — особняк. Строить нужно равномерно по группе.</li><li>Постройки продаются банку за полцены.</li></ul>
    <h3>${t('dn')} (залог)</h3><ul><li>Клетку без построек можно заложить за половину цены — аренда с неё не берётся. Выкуп: залог + 10%.</li></ul>
    <h3>Долги и банкротство</h3><ul><li>Не хватает денег — закладывай и продавай. Если выручить нужную сумму не получается, объявляешь банкротство: имущество уходит кредитору.</li></ul>
    <h3>Сделки</h3><ul><li>В свой ход можно предложить любому игроку обмен: деньги, клетки, карты выписки. Клетки с постройками не обмениваются.</li></ul>
  </div>`;
}
