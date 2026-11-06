// Po'Nopoly rules engine. Pure, deterministic (dice come from the injected rng),
// JSON-serialisable state. Used by the browser (local games) and by the
// Node server (online rooms). Every rule lives here; the UI only renders.

import {
  BOARD, N, CHANCE, CHEST, CARD_BY_ID, GO_SALARY, JAIL_FINE, JAIL_POS, RAIL_RENT, MAX_HOUSES,
  DEFAULT_SETTINGS, isOwnable, groupOf, groupMembers, sqName, sqRef, term, cardText, deckName,
} from './data.js';

export class EngineError extends Error {}

export const PHASE = {
  ROLL: 'roll',       // текущий игрок бросает кубики (или решает, как выйти из больницы)
  BUY: 'buy',         // предложение купить клетку
  TAX: 'tax',         // выбор: 10% или $200 (Tax Evasion)
  CARD: 'card',       // показана карточка, ждём «Ок»
  DEBT: 'debt',       // игрок должен добыть деньги или объявить банкротство
  AUCTION: 'auction', // идёт аукцион
  END: 'end',         // ход можно завершить
  OVER: 'over',       // игра окончена
};

// ---------- RNG ----------
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function d6(rng) { return 1 + Math.floor(rng() * 6); }

// ---------- creation ----------
export function createGame({ players, settings = {}, seed = Date.now() % 2147483647 }) {
  if (!players || players.length < 2) throw new EngineError('Нужно минимум два игрока');
  if (players.length > 6) throw new EngineError('Максимум шесть игроков');
  const rng = mulberry32(seed);
  const s = { ...DEFAULT_SETTINGS, ...settings };
  const st = {
    v: 2,
    seed,
    settings: s,
    players: players.map((p, i) => ({
      id: p.id || `p${i + 1}`,
      name: String(p.name || `Игрок ${i + 1}`).slice(0, 24),
      token: p.token || 'lowrider',
      color: p.color || null,
      bot: !!p.bot,
      cash: s.startCash,
      pos: 0,
      inJail: false,
      jailTurns: 0,
      jailCards: [],
      bankrupt: false,
      skip: false,
    })),
    props: {},
    cur: 0,
    phase: PHASE.ROLL,
    dice: null,
    doubles: 0,
    rolled: false,
    card: null,
    debt: null,
    auction: null,
    trade: null,
    decks: { chance: shuffle(CHANCE.map((c) => c.id), rng), chest: shuffle(CHEST.map((c) => c.id), rng) },
    pool: 0,
    turnNo: 1,
    tradesThisTurn: 0,
    log: [],
    winner: null,
    rngState: Math.floor(rng() * 2147483647),
  };
  const ids = new Set();
  for (const p of st.players) {
    if (ids.has(p.id)) throw new EngineError('Повторяющийся id игрока');
    ids.add(p.id);
  }
  for (const sq of BOARD) if (isOwnable(sq)) st.props[sq.i] = { owner: null, houses: 0, mortgaged: false };
  log(st, `Игра началась. Первым ходит ${st.players[0].name}.`);
  return st;
}

// ---------- helpers ----------
export function player(st, pid) {
  const p = st.players.find((x) => x.id === pid);
  if (!p) throw new EngineError('Неизвестный игрок');
  return p;
}
export function current(st) { return st.players[st.cur]; }
export function activePlayers(st) { return st.players.filter((p) => !p.bankrupt); }
export function ownerOf(st, idx) { return st.props[idx] ? st.props[idx].owner : null; }
export function ownedBy(st, pid) { return Object.keys(st.props).map(Number).filter((i) => st.props[i].owner === pid); }
export function ownsGroup(st, pid, group) { return groupMembers(group).every((i) => st.props[i].owner === pid); }
export function countOwned(st, pid, type) { return BOARD.filter((s) => s.type === type && st.props[s.i].owner === pid).length; }

export function housesOnBoard(st) {
  let h = 0; for (const i of Object.keys(st.props)) h += st.props[i].houses; return h;
}

// "Общая стоимость" для налога 10%: наличные + цены всех клеток + стоимость построек.
export function netWorth(st, pid) {
  const p = player(st, pid);
  let w = p.cash;
  for (const i of ownedBy(st, pid)) {
    const sq = BOARD[i];
    w += st.props[i].mortgaged ? Math.floor(sq.price / 2) : sq.price;
    if (sq.type === 'prop') w += st.props[i].houses * sq.house;
  }
  return w;
}

// Сколько можно выручить, если всё продать и заложить.
export function liquidValue(st, pid) {
  const p = player(st, pid);
  let v = p.cash;
  for (const i of ownedBy(st, pid)) {
    const sq = BOARD[i];
    if (!st.props[i].mortgaged) v += Math.floor(sq.price / 2);
    if (sq.type === 'prop') v += st.props[i].houses * Math.floor(sq.house / 2);
  }
  return v;
}

export function rentFor(st, idx, diceTotal, opts = {}) {
  const sq = BOARD[idx];
  const ps = st.props[idx];
  if (!ps || ps.owner == null || ps.mortgaged) return 0;
  if (sq.type === 'prop') {
    if (ps.houses > 0) return sq.rent[ps.houses];
    return ownsGroup(st, ps.owner, sq.group) ? sq.rent[0] * 2 : sq.rent[0];
  }
  if (sq.type === 'rail') {
    const n = countOwned(st, ps.owner, 'rail');
    const r = RAIL_RENT[Math.max(0, Math.min(3, n - 1))];
    return opts.double ? r * 2 : r;
  }
  if (sq.type === 'util') {
    const n = countOwned(st, ps.owner, 'util');
    const mult = opts.tenX || n === 2 ? 10 : 4;
    return mult * (diceTotal || 0);
  }
  return 0;
}

export function mortgageValue(idx) { return Math.floor(BOARD[idx].price / 2); }
export function unmortgageCost(idx) { return Math.ceil((mortgageValue(idx) * 11) / 10); } // +10%, целочисленно

function log(st, text, pid = null) {
  st.log.push({ n: st.log.length + 1, t: text, p: pid, turn: st.turnNo });
  if (st.log.length > 300) st.log.splice(0, st.log.length - 300);
}

function nearest(from, type) {
  for (let k = 1; k <= N; k++) {
    const i = (from + k) % N;
    if (BOARD[i].type === type) return i;
  }
  return from;
}

// ---------- money ----------
// Кладёт деньги в банк (или в банк Free Parking, если включено правило).
function toBank(st, amount) {
  if (st.settings.freeParkingPool) st.pool += amount;
}

function give(st, pid, amount, ev, reason) {
  const p = player(st, pid);
  p.cash += amount;
  ev.push({ type: 'cash', pid, delta: amount, reason });
}

// Списывает деньги. Если не хватает — переводит игрока в фазу долга.
// `to` — id кредитора или null (банк). Возвращает true, если оплачено сразу.
function charge(st, pid, amount, to, ev, reason, after = null, split = null) {
  const p = player(st, pid);
  if (amount <= 0) return true;
  if (p.cash >= amount) {
    p.cash -= amount;
    ev.push({ type: 'cash', pid, delta: -amount, reason });
    settle(st, amount, to, ev, split);
    return true;
  }
  st.debt = { pid, amount, to, reason, after, split };
  st.phase = PHASE.DEBT;
  log(st, `${p.name} должен $${amount} (${reason}) и не может заплатить. Нужно заложить имущество или объявить банкротство.`, pid);
  ev.push({ type: 'debt', pid, amount, to });
  return false;
}

function settle(st, amount, to, ev, split) {
  if (split) {
    for (const s of split) {
      const q = player(st, s.pid);
      if (!q.bankrupt) { q.cash += s.amount; ev.push({ type: 'cash', pid: s.pid, delta: s.amount, reason: 'card' }); }
    }
    return;
  }
  if (to == null) { toBank(st, amount); return; }
  const q = player(st, to);
  q.cash += amount;
  ev.push({ type: 'cash', pid: to, delta: amount, reason: 'income' });
}

// ---------- movement ----------
function passGo(st, p, ev) {
  p.cash += GO_SALARY;
  ev.push({ type: 'cash', pid: p.id, delta: GO_SALARY, reason: 'go' });
  log(st, `${p.name} проходит СТАРТ и получает $${GO_SALARY}.`, p.id);
}

function moveForward(st, p, steps, ev) {
  const from = p.pos;
  const to = (from + steps) % N;
  p.pos = to;
  ev.push({ type: 'move', pid: p.id, from, to, steps, mode: 'forward' });
  if (to < from || steps >= N) passGo(st, p, ev);
}

function moveTo(st, p, to, ev, collect = true) {
  const from = p.pos;
  p.pos = to;
  ev.push({ type: 'move', pid: p.id, from, to, mode: 'forward' });
  if (collect && to <= from) passGo(st, p, ev);
}

function moveBack(st, p, n, ev) {
  const from = p.pos;
  const to = (from - n + N) % N;
  p.pos = to;
  ev.push({ type: 'move', pid: p.id, from, to, mode: 'back' });
}

function sendToJail(st, p, ev, why) {
  const from = p.pos;
  p.pos = JAIL_POS;
  p.inJail = true;
  p.jailTurns = 0;
  st.doubles = 0;
  ev.push({ type: 'move', pid: p.id, from, to: JAIL_POS, mode: 'jail' });
  ev.push({ type: 'jail', pid: p.id });
  log(st, `${p.name}: ${why}. Прямиком ${term(st, 'hospitalIn')}.`, p.id);
  st.phase = PHASE.END;
}

// ---------- landing ----------
function land(st, p, ev, opts = {}) {
  const sq = BOARD[p.pos];
  const diceTotal = st.dice ? st.dice[0] + st.dice[1] : 0;
  ev.push({ type: 'land', pid: p.id, idx: p.pos });
  switch (sq.type) {
    case 'prop': case 'rail': case 'util': {
      const ps = st.props[sq.i];
      if (ps.owner == null) {
        st.phase = PHASE.BUY;
        log(st, `${p.name} попадает на ${sqRef(st, sq.i)}. Клетка свободна — цена $${sq.price}.`, p.id);
        return;
      }
      if (ps.owner === p.id) { st.phase = PHASE.END; log(st, `${p.name} попадает на свою клетку ${sqRef(st, sq.i)}.`, p.id); return; }
      if (ps.mortgaged) { st.phase = PHASE.END; log(st, `${sqRef(st, sq.i)} ${term(st, 'dnUnder')} — аренда не берётся.`, p.id); return; }
      const owner = player(st, ps.owner);
      const rent = rentFor(st, sq.i, diceTotal, opts);
      log(st, `${p.name} попадает на ${sqRef(st, sq.i)} (хозяин ${owner.name}). Аренда $${rent}.`, p.id);
      ev.push({ type: 'rent', from: p.id, to: owner.id, amount: rent, idx: sq.i });
      st.phase = PHASE.END;
      charge(st, p.id, rent, owner.id, ev, `аренда за ${sqRef(st, sq.i)}`);
      return;
    }
    case 'tax': {
      if (sq.percent) {
        st.phase = PHASE.TAX;
        log(st, `${p.name} попадает на ${sqRef(st, sq.i)}: $${sq.amount} или ${sq.percent}% от всего имущества.`, p.id);
        return;
      }
      log(st, `${p.name} попадает на ${sqRef(st, sq.i)} — отбирают $${sq.amount}.`, p.id);
      st.phase = PHASE.END;
      charge(st, p.id, sq.amount, null, ev, 'ограбление');
      return;
    }
    case 'chance': case 'chest': {
      const deck = sq.type === 'chance' ? 'chance' : 'chest';
      const id = st.decks[deck].shift();
      const card = CARD_BY_ID[id];
      if (card.fx.k !== 'jailcard') st.decks[deck].push(id);
      st.card = { deck, id };
      st.phase = PHASE.CARD;
      ev.push({ type: 'card', pid: p.id, deck, id });
      log(st, `${p.name} тянет карту «${deckName(st, deck)}»: ${cardText(st, card)}`, p.id);
      return;
    }
    case 'gotojail':
      sendToJail(st, p, ev, term(st, 'carjackEvent'));
      return;
    case 'driveby':
      p.skip = true;
      st.doubles = 0;
      st.phase = PHASE.END;
      ev.push({ type: 'driveby', pid: p.id });
      log(st, `${p.name} ${term(st, 'drivebyEvent')}.`, p.id);
      return;
    case 'parking': {
      st.phase = PHASE.END;
      if (st.settings.freeParkingPool && st.pool > 0) {
        const amt = st.pool; st.pool = 0;
        give(st, p.id, amt, ev, 'parking');
        log(st, `${p.name} забирает с клетки «${term(st, 'parking')}» $${amt}.`, p.id);
      } else log(st, `${p.name} отдыхает на клетке «${term(st, 'parking')}».`, p.id);
      return;
    }
    case 'jail':
      st.phase = PHASE.END; log(st, `${p.name} ${term(st, 'visiting')}.`, p.id); return;
    case 'go':
      st.phase = PHASE.END; log(st, `${p.name} на СТАРТе.`, p.id); return;
    default:
      st.phase = PHASE.END;
  }
}

function applyCard(st, p, card, ev) {
  const fx = card.fx;
  switch (fx.k) {
    case 'go': moveTo(st, p, 0, ev, true); st.phase = PHASE.END; break;
    case 'move': moveTo(st, p, fx.to, ev, true); land(st, p, ev); break;
    case 'back': moveBack(st, p, fx.n, ev); land(st, p, ev); break;
    case 'rail': moveTo(st, p, nearest(p.pos, 'rail'), ev, true); land(st, p, ev, { double: true }); break;
    case 'util': {
      moveTo(st, p, nearest(p.pos, 'util'), ev, true);
      const ps = st.props[p.pos];
      if (ps.owner != null && ps.owner !== p.id && !ps.mortgaged) {
        const rng = rngFor(st);
        st.dice = [d6(rng), d6(rng)];
        ev.push({ type: 'dice', pid: p.id, dice: st.dice, extra: true });
      }
      land(st, p, ev, { tenX: true });
      break;
    }
    case 'cash':
      st.phase = PHASE.END;
      if (fx.a >= 0) give(st, p.id, fx.a, ev, 'card');
      else charge(st, p.id, -fx.a, null, ev, 'по карточке');
      break;
    case 'each': {
      st.phase = PHASE.END;
      const others = activePlayers(st).filter((q) => q.id !== p.id);
      if (fx.a > 0) {
        for (const q of others) {
          const amt = Math.min(q.cash, fx.a); // у кого нет — отдаёт что есть
          q.cash -= amt; p.cash += amt;
          ev.push({ type: 'cash', pid: q.id, delta: -amt, reason: 'card' });
          ev.push({ type: 'cash', pid: p.id, delta: amt, reason: 'card' });
        }
      } else {
        const per = -fx.a;
        const split = others.map((q) => ({ pid: q.id, amount: per }));
        charge(st, p.id, per * others.length, null, ev, 'по карточке (каждому игроку)', null, split);
      }
      break;
    }
    case 'jailcard':
      p.jailCards.push(card.id);
      st.phase = PHASE.END;
      ev.push({ type: 'jailcard', pid: p.id });
      break;
    case 'jail': sendToJail(st, p, ev, 'по карточке'); break;
    case 'repairs': {
      let total = 0;
      for (const i of ownedBy(st, p.id)) {
        const h = st.props[i].houses;
        if (h === MAX_HOUSES) total += fx.m; else total += h * fx.h;
      }
      st.phase = PHASE.END;
      if (total > 0) { log(st, `${p.name} платит за постройки $${total}.`, p.id); charge(st, p.id, total, null, ev, 'ремонт построек'); }
      break;
    }
    default: st.phase = PHASE.END;
  }
}

// Deterministic rng: the state advances inside `st`, so a saved game replays
// the same dice. The server or tests may inject their own rng instead.
function rngStep(st) {
  let a = (st.rngState + 0x6D2B79F5) | 0;
  st.rngState = a >>> 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function rngFor(st, external) {
  if (external) return external;
  return () => rngStep(st);
}

// ---------- turn flow ----------
function nextTurn(st, ev) {
  const n = st.players.length;
  let skipped = 0;
  for (let k = 1; k <= n * 2; k++) {
    const i = (st.cur + k) % n;
    const q = st.players[i];
    if (q.bankrupt) continue;
    if (q.skip && skipped < n) { q.skip = false; skipped++; log(st, `${q.name} отлёживается после обстрела и пропускает ход.`, q.id); ev.push({ type: 'skipped', pid: q.id }); continue; }
    st.cur = i; break;
  }
  st.phase = PHASE.ROLL;
  st.dice = null; st.doubles = 0; st.rolled = false; st.card = null; st.tradesThisTurn = 0;
  st.turnNo += 1;
  ev.push({ type: 'turn', pid: current(st).id });
}

function checkWinner(st, ev) {
  const alive = activePlayers(st);
  if (alive.length === 1) {
    st.winner = alive[0].id;
    st.phase = PHASE.OVER;
    log(st, `${alive[0].name} остаётся последним на районе и побеждает!`);
    ev.push({ type: 'winner', pid: alive[0].id });
    return true;
  }
  return false;
}

function goBankrupt(st, p, creditor, ev) {
  log(st, `${p.name} — банкрот.${creditor ? ` Всё имущество уходит к ${player(st, creditor).name}.` : ' Имущество возвращается в банк.'}`, p.id);
  // Постройки продаются банку за полцены, деньги идут кредитору.
  for (const i of ownedBy(st, p.id)) {
    const sq = BOARD[i];
    const ps = st.props[i];
    if (sq.type === 'prop' && ps.houses > 0) { p.cash += ps.houses * Math.floor(sq.house / 2); ps.houses = 0; }
  }
  if (creditor) {
    const c = player(st, creditor);
    c.cash += p.cash;
    ev.push({ type: 'cash', pid: creditor, delta: p.cash, reason: 'bankruptcy' });
    for (const i of ownedBy(st, p.id)) st.props[i].owner = creditor;
    c.jailCards.push(...p.jailCards);
  } else {
    for (const i of ownedBy(st, p.id)) { st.props[i].owner = null; st.props[i].mortgaged = false; }
    for (const id of p.jailCards) st.decks[id.startsWith('c') ? 'chance' : 'chest'].push(id);
  }
  p.cash = 0; p.jailCards = []; p.bankrupt = true; p.inJail = false;
  st.debt = null;
  ev.push({ type: 'bankrupt', pid: p.id, to: creditor });
  if (st.trade && (st.trade.from === p.id || st.trade.to === p.id)) st.trade = null;
  if (st.auction) {
    st.auction.active = st.auction.active.filter((id) => id !== p.id);
    st.auction.passed = st.auction.passed.filter((id) => id !== p.id);
  }
  if (checkWinner(st, ev)) return;
  if (st.auction) { advanceAuction(st, ev); return; }
  if (current(st).id === p.id) nextTurn(st, ev);
  else st.phase = st.phase === PHASE.DEBT ? PHASE.END : st.phase;
}

function afterDebtPaid(st, ev) {
  const d = st.debt;
  st.debt = null;
  const p = player(st, d.pid);
  log(st, `${p.name} расплатился: $${d.amount} (${d.reason}).`, p.id);
  if (d.after === 'jail_move') {
    p.inJail = false; p.jailTurns = 0;
    st.phase = PHASE.END;
    moveForward(st, p, st.dice[0] + st.dice[1], ev);
    land(st, p, ev);
    return;
  }
  st.phase = PHASE.END;
}

function tryAutoPay(st, ev) {
  const d = st.debt;
  if (!d) return;
  const p = player(st, d.pid);
  if (p.cash >= d.amount) {
    p.cash -= d.amount;
    ev.push({ type: 'cash', pid: p.id, delta: -d.amount, reason: d.reason });
    settle(st, d.amount, d.to, ev, d.split);
    afterDebtPaid(st, ev);
  }
}

// ---------- auction ----------
function startAuction(st, idx, ev) {
  const order = [];
  const n = st.players.length;
  for (let k = 1; k <= n; k++) {
    const q = st.players[(st.cur + k) % n];
    if (!q.bankrupt) order.push(q.id);
  }
  st.auction = { idx, active: order, passed: [], highest: null, turnPid: order[0], bids: {} };
  st.phase = PHASE.AUCTION;
  log(st, `Аукцион за ${sqRef(st, idx)}. Первым торгуется ${player(st, order[0]).name}.`);
  ev.push({ type: 'auction_start', idx });
}

function advanceAuction(st, ev) {
  const a = st.auction;
  const remaining = a.active.filter((id) => !a.passed.includes(id));
  if (remaining.length === 0 || (remaining.length === 1 && a.highest && a.highest.pid === remaining[0])) {
    finishAuction(st, ev);
    return;
  }
  if (remaining.length === 1 && !a.highest) {
    // остался один, но ставок нет — он может поставить или пасануть
    a.turnPid = remaining[0];
    return;
  }
  const i = a.active.indexOf(a.turnPid);
  for (let k = 1; k <= a.active.length; k++) {
    const id = a.active[(i + k) % a.active.length];
    if (!a.passed.includes(id)) { a.turnPid = id; return; }
  }
  finishAuction(st, ev);
}

function finishAuction(st, ev) {
  const a = st.auction;
  const sq = BOARD[a.idx];
  if (a.highest) {
    const w = player(st, a.highest.pid);
    w.cash -= a.highest.amount;
    st.props[a.idx].owner = w.id;
    ev.push({ type: 'cash', pid: w.id, delta: -a.highest.amount, reason: 'auction' });
    ev.push({ type: 'buy', pid: w.id, idx: a.idx, price: a.highest.amount, auction: true });
    log(st, `${w.name} выигрывает аукцион за ${sqRef(st, a.idx)}: $${a.highest.amount}.`, w.id);
  } else {
    log(st, `Аукцион за ${sqRef(st, a.idx)} никого не заинтересовал.`);
  }
  st.auction = null;
  ev.push({ type: 'auction_end', idx: a.idx, winner: a.highest ? a.highest.pid : null });
  st.phase = st.winner ? PHASE.OVER : PHASE.END;
}

// ---------- trade ----------
function validateTrade(st, t) {
  const from = player(st, t.from), to = player(st, t.to);
  if (from.bankrupt || to.bankrupt) throw new EngineError('Игрок выбыл');
  if (t.from === t.to) throw new EngineError('Нельзя торговать с собой');
  for (const side of [['give', from], ['get', to]]) {
    const [key, who] = side;
    const part = t[key];
    if (part.cash < 0 || !Number.isInteger(part.cash)) throw new EngineError('Некорректная сумма');
    if (part.cash > who.cash) throw new EngineError(`${who.name}: не хватает наличных`);
    for (const i of part.props) {
      if (!st.props[i] || st.props[i].owner !== who.id) throw new EngineError(`${who.name} не владеет ${sqRef(st, i)}`);
      const g = groupOf(BOARD[i]);
      if (BOARD[i].type === 'prop' && groupMembers(g).some((j) => st.props[j].houses > 0)) throw new EngineError(`Сначала продайте постройки в группе ${sqRef(st, i)}`);
    }
    if (part.cards > who.jailCards.length) throw new EngineError(`${who.name}: нет столько карт выписки`);
  }
  if (t.give.cash === 0 && t.give.props.length === 0 && t.give.cards === 0 && t.get.cash === 0 && t.get.props.length === 0 && t.get.cards === 0) throw new EngineError('Пустая сделка');
}

function executeTrade(st, t, ev) {
  const from = player(st, t.from), to = player(st, t.to);
  from.cash -= t.give.cash; to.cash += t.give.cash;
  to.cash -= t.get.cash; from.cash += t.get.cash;
  for (const i of t.give.props) st.props[i].owner = to.id;
  for (const i of t.get.props) st.props[i].owner = from.id;
  for (let k = 0; k < t.give.cards; k++) to.jailCards.push(from.jailCards.pop());
  for (let k = 0; k < t.get.cards; k++) from.jailCards.push(to.jailCards.pop());
  ev.push({ type: 'trade_done', from: from.id, to: to.id });
  log(st, `Сделка: ${from.name} ↔ ${to.name}. ${describeTrade(st, t)}`);
}

export function describeTrade(st, t) {
  const from = player(st, t.from), to = player(st, t.to);
  const side = (part) => {
    const items = [];
    if (part.cash) items.push(`$${part.cash}`);
    for (const i of part.props) items.push(sqName(st, i));
    if (part.cards) items.push(`выписка ×${part.cards}`);
    return items.length ? items.join(', ') : 'ничего';
  };
  return `${from.name} отдаёт: ${side(t.give)}. ${to.name} отдаёт: ${side(t.get)}.`;
}

// ---------- property management ----------
function canBuild(st, pid, idx) {
  const sq = BOARD[idx];
  if (!sq || sq.type !== 'prop') return 'Здесь нельзя строить';
  const ps = st.props[idx];
  if (ps.owner !== pid) return 'Это не ваша клетка';
  if (!ownsGroup(st, pid, sq.group)) return 'Нужна вся цветовая группа';
  const members = groupMembers(sq.group);
  if (members.some((j) => st.props[j].mortgaged)) return `В группе есть клетка ${term(st, 'dnUnder')}`;
  if (ps.houses >= MAX_HOUSES) return 'Уже стоит особняк';
  const minH = Math.min(...members.map((j) => st.props[j].houses));
  if (ps.houses > minH) return 'Стройте равномерно по группе';
  if (player(st, pid).cash < sq.house) return 'Не хватает денег';
  return null;
}

function canSellHouse(st, pid, idx) {
  const sq = BOARD[idx];
  if (!sq || sq.type !== 'prop') return 'Здесь нет построек';
  const ps = st.props[idx];
  if (ps.owner !== pid) return 'Это не ваша клетка';
  if (ps.houses === 0) return 'Нет построек';
  const maxH = Math.max(...groupMembers(sq.group).map((j) => st.props[j].houses));
  if (ps.houses < maxH) return 'Продавайте равномерно по группе';
  return null;
}

function canMortgage(st, pid, idx) {
  const sq = BOARD[idx];
  if (!sq || !isOwnable(sq)) return 'Нельзя заложить';
  const ps = st.props[idx];
  if (ps.owner !== pid) return 'Это не ваша клетка';
  if (ps.mortgaged) return 'Уже заложено';
  if (sq.type === 'prop' && groupMembers(sq.group).some((j) => st.props[j].houses > 0)) return 'Сначала продайте постройки в группе';
  return null;
}

function canUnmortgage(st, pid, idx) {
  const sq = BOARD[idx];
  if (!sq || !isOwnable(sq)) return 'Нельзя';
  const ps = st.props[idx];
  if (ps.owner !== pid) return 'Это не ваша клетка';
  if (!ps.mortgaged) return 'Не заложено';
  if (player(st, pid).cash < unmortgageCost(idx)) return 'Не хватает денег';
  return null;
}

export const checks = { canBuild, canSellHouse, canMortgage, canUnmortgage };

// ---------- what can a player do now? ----------
export function legalActions(st, pid) {
  const p = st.players.find((x) => x.id === pid);
  if (!p || p.bankrupt || st.phase === PHASE.OVER) return [];
  const acts = [];
  const isCur = current(st).id === pid;
  const manage = ['mortgage', 'unmortgage', 'sell_house'];
  if (st.phase === PHASE.AUCTION) {
    if (st.auction.turnPid === pid) acts.push('bid', 'pass');
    acts.push(...manage);
    return acts;
  }
  if (st.trade) {
    if (st.trade.to === pid) acts.push('trade_accept', 'trade_reject');
    if (st.trade.from === pid) acts.push('trade_cancel');
    acts.push(...manage);
    return acts;
  }
  if (st.phase === PHASE.DEBT) {
    if (st.debt.pid === pid) { acts.push(...manage, 'bankrupt'); if (p.cash >= st.debt.amount) acts.push('pay_debt'); }
    return acts;
  }
  acts.push(...manage, 'surrender');
  if (!isCur) return acts;
  switch (st.phase) {
    case PHASE.ROLL:
      if (p.inJail) { acts.push('roll', 'build', 'trade_offer'); if (p.cash >= JAIL_FINE) acts.push('jail_pay'); if (p.jailCards.length) acts.push('jail_card'); }
      else acts.push('roll', 'build', 'trade_offer');
      break;
    case PHASE.BUY: {
      const sq = BOARD[p.pos];
      if (p.cash >= sq.price) acts.push('buy');
      acts.push('skip_buy');
      break;
    }
    case PHASE.TAX: acts.push('tax'); break;
    case PHASE.CARD: acts.push('ack_card'); break;
    case PHASE.END: acts.push('end_turn', 'build', 'trade_offer'); break;
    default: break;
  }
  return acts;
}

// Кто сейчас должен что-то сделать (для ботов и подсветки).
export function whoActs(st) {
  if (st.phase === PHASE.OVER) return [];
  if (st.phase === PHASE.AUCTION) return [st.auction.turnPid];
  if (st.trade) return [st.trade.to];
  if (st.phase === PHASE.DEBT) return [st.debt.pid];
  return [current(st).id];
}

// ---------- main entry ----------
export function applyAction(st, action, rng) {
  if (!action || typeof action.type !== 'string') throw new EngineError('Нет действия');
  if (st.phase === PHASE.OVER) throw new EngineError('Игра окончена');
  const pid = action.pid;
  const p = player(st, pid);
  if (p.bankrupt) throw new EngineError('Вы выбыли из игры');
  const ev = [];
  const legal = legalActions(st, pid);
  if (!legal.includes(action.type)) throw new EngineError(`Сейчас нельзя: ${action.type}`);
  const R = rngFor(st, rng);

  switch (action.type) {
    case 'roll': {
      const dice = [d6(R), d6(R)];
      st.dice = dice; st.rolled = true;
      const isDouble = dice[0] === dice[1];
      ev.push({ type: 'dice', pid, dice });
      if (p.inJail) {
        if (isDouble) {
          p.inJail = false; p.jailTurns = 0; st.doubles = 0;
          log(st, `${p.name} выбрасывает дубль ${dice[0]}:${dice[1]} и выходит ${term(st, 'hospitalFrom')}.`, pid);
          st.phase = PHASE.END;
          moveForward(st, p, dice[0] + dice[1], ev);
          land(st, p, ev);
        } else {
          p.jailTurns += 1;
          if (p.jailTurns >= 3) {
            log(st, `${p.name}: третья попытка (${dice[0]}:${dice[1]}) — платит $${JAIL_FINE} и выходит.`, pid);
            st.phase = PHASE.END;
            if (charge(st, pid, JAIL_FINE, null, ev, `выписка ${term(st, 'hospitalFrom')}`, 'jail_move')) {
              p.inJail = false; p.jailTurns = 0;
              moveForward(st, p, dice[0] + dice[1], ev);
              land(st, p, ev);
            }
          } else {
            log(st, `${p.name} выбрасывает ${dice[0]}:${dice[1]} — остаётся лежать (${term(st, 'hospitalShort')}).`, pid);
            st.phase = PHASE.END;
          }
        }
        break;
      }
      if (isDouble) st.doubles += 1; else st.doubles = 0;
      if (st.doubles >= 3) {
        log(st, `${p.name} выбрасывает третий дубль подряд.`, pid);
        sendToJail(st, p, ev, 'три дубля подряд — копы заметили');
        break;
      }
      log(st, `${p.name} бросает ${dice[0]}:${dice[1]}${isDouble ? ' (дубль!)' : ''}.`, pid);
      moveForward(st, p, dice[0] + dice[1], ev);
      land(st, p, ev);
      break;
    }
    case 'jail_pay': {
      p.cash -= JAIL_FINE; toBank(st, JAIL_FINE);
      p.inJail = false; p.jailTurns = 0;
      ev.push({ type: 'cash', pid, delta: -JAIL_FINE, reason: 'jail' });
      log(st, `${p.name} платит $${JAIL_FINE} и выходит ${term(st, 'hospitalFrom')}.`, pid);
      break;
    }
    case 'jail_card': {
      const id = p.jailCards.pop();
      st.decks[id.startsWith('c') ? 'chance' : 'chest'].push(id);
      p.inJail = false; p.jailTurns = 0;
      ev.push({ type: 'jailcard_used', pid });
      log(st, `${p.name} использует карту выписки и выходит ${term(st, 'hospitalFrom')}.`, pid);
      break;
    }
    case 'buy': {
      const sq = BOARD[p.pos];
      p.cash -= sq.price;
      st.props[sq.i].owner = pid;
      ev.push({ type: 'cash', pid, delta: -sq.price, reason: 'buy' });
      ev.push({ type: 'buy', pid, idx: sq.i, price: sq.price });
      log(st, `${p.name} покупает ${sqRef(st, sq.i)} за $${sq.price}.`, pid);
      st.phase = PHASE.END;
      break;
    }
    case 'skip_buy': {
      const sq = BOARD[p.pos];
      log(st, `${p.name} не покупает ${sqRef(st, sq.i)}.`, pid);
      if (st.settings.auctions && activePlayers(st).length > 1) startAuction(st, sq.i, ev);
      else st.phase = PHASE.END;
      break;
    }
    case 'bid': {
      const a = st.auction;
      const amount = Math.floor(Number(action.amount));
      const min = a.highest ? a.highest.amount + 1 : 1;
      if (!Number.isFinite(amount) || amount < min) throw new EngineError(`Ставка должна быть не меньше $${min}`);
      if (amount > p.cash) throw new EngineError('Не хватает наличных');
      a.highest = { pid, amount };
      a.bids[pid] = amount;
      ev.push({ type: 'bid', pid, amount });
      log(st, `${p.name} ставит $${amount}.`, pid);
      advanceAuction(st, ev);
      break;
    }
    case 'pass': {
      const a = st.auction;
      a.passed.push(pid);
      ev.push({ type: 'pass', pid });
      log(st, `${p.name} пасует.`, pid);
      advanceAuction(st, ev);
      break;
    }
    case 'tax': {
      const sq = BOARD[p.pos];
      const pct = Math.floor(netWorth(st, pid) * sq.percent / 100);
      const amount = action.mode === 'percent' ? pct : sq.amount;
      log(st, `${p.name} платит налог $${amount} (${action.mode === 'percent' ? sq.percent + '%' : 'фикс'}).`, pid);
      st.phase = PHASE.END;
      charge(st, pid, amount, null, ev, term(st, 'tax'));
      break;
    }
    case 'ack_card': {
      const card = CARD_BY_ID[st.card.id];
      st.card = null;
      applyCard(st, p, card, ev);
      break;
    }
    case 'build': {
      const idx = Number(action.idx);
      const err = canBuild(st, pid, idx);
      if (err) throw new EngineError(err);
      const sq = BOARD[idx];
      p.cash -= sq.house; st.props[idx].houses += 1;
      ev.push({ type: 'cash', pid, delta: -sq.house, reason: 'build' });
      ev.push({ type: 'build', pid, idx, houses: st.props[idx].houses });
      log(st, `${p.name} строит ${st.props[idx].houses === MAX_HOUSES ? 'особняк' : 'хату'} на ${sqRef(st, idx)} за $${sq.house}.`, pid);
      break;
    }
    case 'sell_house': {
      const idx = Number(action.idx);
      const err = canSellHouse(st, pid, idx);
      if (err) throw new EngineError(err);
      const sq = BOARD[idx];
      const back = Math.floor(sq.house / 2);
      p.cash += back; st.props[idx].houses -= 1;
      ev.push({ type: 'cash', pid, delta: back, reason: 'sell_house' });
      ev.push({ type: 'sell_house', pid, idx, houses: st.props[idx].houses });
      log(st, `${p.name} продаёт постройку на ${sqRef(st, idx)} за $${back}.`, pid);
      tryAutoPay(st, ev);
      break;
    }
    case 'mortgage': {
      const idx = Number(action.idx);
      const err = canMortgage(st, pid, idx);
      if (err) throw new EngineError(err);
      const v = mortgageValue(idx);
      p.cash += v; st.props[idx].mortgaged = true;
      ev.push({ type: 'cash', pid, delta: v, reason: 'mortgage' });
      ev.push({ type: 'mortgage', pid, idx });
      log(st, `${p.name} закладывает ${sqRef(st, idx)} (${term(st, 'dn')}) за $${v}.`, pid);
      tryAutoPay(st, ev);
      break;
    }
    case 'unmortgage': {
      const idx = Number(action.idx);
      const err = canUnmortgage(st, pid, idx);
      if (err) throw new EngineError(err);
      const c = unmortgageCost(idx);
      p.cash -= c; st.props[idx].mortgaged = false;
      ev.push({ type: 'cash', pid, delta: -c, reason: 'unmortgage' });
      ev.push({ type: 'unmortgage', pid, idx });
      log(st, `${p.name} выкупает ${sqRef(st, idx)} за $${c}.`, pid);
      break;
    }
    case 'pay_debt': {
      tryAutoPay(st, ev);
      break;
    }
    case 'bankrupt': {
      const d = st.debt;
      if (liquidValue(st, pid) >= d.amount) throw new EngineError('Вы ещё можете расплатиться: продайте постройки или заложите клетки');
      goBankrupt(st, p, d.to, ev);
      break;
    }
    case 'surrender': {
      if (activePlayers(st).length < 2) throw new EngineError('Некому сдаваться');
      log(st, `${p.name} сдаётся.`, pid);
      goBankrupt(st, p, null, ev);
      break;
    }
    case 'end_turn': {
      if (st.doubles > 0 && !p.inJail) {
        st.phase = PHASE.ROLL;
        st.rolled = false;
        log(st, `${p.name} бросает ещё раз (дубль).`, pid);
        ev.push({ type: 'again', pid });
      } else nextTurn(st, ev);
      break;
    }
    case 'trade_offer': {
      const t = {
        from: pid, to: String(action.to),
        give: { cash: Math.floor(Number(action.give?.cash) || 0), props: (action.give?.props || []).map(Number), cards: Math.floor(Number(action.give?.cards) || 0) },
        get: { cash: Math.floor(Number(action.get?.cash) || 0), props: (action.get?.props || []).map(Number), cards: Math.floor(Number(action.get?.cards) || 0) },
      };
      if ((st.tradesThisTurn || 0) >= 5) throw new EngineError('Хватит торговаться на этот ход');
      validateTrade(st, t);
      st.trade = t;
      st.tradesThisTurn = (st.tradesThisTurn || 0) + 1;
      ev.push({ type: 'trade_offer', from: pid, to: t.to });
      log(st, `${p.name} предлагает сделку игроку ${player(st, t.to).name}. ${describeTrade(st, t)}`, pid);
      break;
    }
    case 'trade_accept': {
      const t = st.trade;
      validateTrade(st, t);
      st.trade = null;
      executeTrade(st, t, ev);
      break;
    }
    case 'trade_reject': {
      const t = st.trade; st.trade = null;
      ev.push({ type: 'trade_rejected', from: t.from, to: t.to });
      log(st, `${p.name} отклоняет сделку.`, pid);
      break;
    }
    case 'trade_cancel': {
      st.trade = null;
      ev.push({ type: 'trade_cancel', from: pid });
      log(st, `${p.name} отзывает предложение.`, pid);
      break;
    }
    default:
      throw new EngineError('Неизвестное действие');
  }
  return ev;
}

// Snapshot helpers
export function serialize(st) { return JSON.stringify(st); }
export function deserialize(json) {
  const st = JSON.parse(json);
  if (!st || st.v !== 2 || !Array.isArray(st.players)) throw new EngineError('Повреждённое сохранение');
  return st;
}
