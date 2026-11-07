// Простые, но вменяемые боты. Работают и в браузере, и на сервере.
import { BOARD, PROP_GROUPS, groupOf, groupMembers, JAIL_FINE, MAX_HOUSES } from './data.js';
import { legalActions, whoActs, netWorth, liquidValue, ownsGroup, housesOnBoard, checks, unmortgageCost, PHASE, current, ownedBy } from './engine.js';

function reserve(st) {
  const h = housesOnBoard(st);
  return 120 + Math.min(300, h * 15);
}

// Субъективная ценность клетки для игрока pid.
export function propValue(st, pid, idx) {
  const sq = BOARD[idx];
  let v = sq.price;
  const members = groupMembers(groupOf(sq));
  const mine = members.filter((i) => st.props[i].owner === pid).length;
  const others = members.filter((i) => st.props[i].owner && st.props[i].owner !== pid).length;
  if (sq.type === 'prop') {
    if (mine === members.length - 1 && others === 0) v *= 1.7;
    else if (mine > 0 && others === 0) v *= 1.25;
    if (others > 0) v *= 0.8;
    if (['orange', 'red', 'pink'].includes(sq.group)) v *= 1.1; // самые «проходные» группы
  } else if (sq.type === 'rail') v *= 1 + 0.15 * mine;
  else v *= mine ? 1.15 : 0.85;
  if (st.props[idx].mortgaged) v *= 0.7;
  return v;
}

function wouldCompleteGroup(st, pid, idx) {
  const sq = BOARD[idx];
  if (sq.type !== 'prop') return false;
  return groupMembers(sq.group).every((i) => i === idx || st.props[i].owner === pid);
}

function bestBuild(st, p) {
  let best = null;
  for (const i of ownedBy(st, p.id)) {
    const sq = BOARD[i];
    if (sq.type !== 'prop') continue;
    if (checks.canBuild(st, p.id, i)) continue;
    if (p.cash - sq.house < reserve(st)) continue;
    const h = st.props[i].houses;
    const gain = (sq.rent[h + 1] - sq.rent[h]) / sq.house;
    if (!best || gain > best.gain) best = { idx: i, gain };
  }
  return best ? { type: 'build', pid: p.id, idx: best.idx } : null;
}

function bestUnmortgage(st, p) {
  for (const i of ownedBy(st, p.id)) {
    if (!st.props[i].mortgaged) continue;
    const cost = unmortgageCost(i);
    const sq = BOARD[i];
    const important = sq.type === 'rail' || (sq.type === 'prop' && ownsGroup(st, p.id, sq.group));
    if (p.cash - cost >= reserve(st) * (important ? 1.2 : 2)) return { type: 'unmortgage', pid: p.id, idx: i };
  }
  return null;
}

// Добыть деньги в фазе долга: сначала постройки с самых дешёвых групп, потом залог одиночек, потом остальное.
function raiseMoney(st, p) {
  const need = st.debt.amount - p.cash;
  if (liquidValue(st, p.id) < st.debt.amount) return { type: 'bankrupt', pid: p.id };
  const owned = ownedBy(st, p.id);
  // 1. одиночные (не монополия) клетки без построек — залог, дешёвые первыми
  const singles = owned.filter((i) => !st.props[i].mortgaged && !checks.canMortgage(st, p.id, i) && !(BOARD[i].type === 'prop' && ownsGroup(st, p.id, BOARD[i].group)))
    .sort((a, b) => BOARD[a].price - BOARD[b].price);
  // предпочтительно одна клетка, покрывающая долг, иначе самая дешёвая
  const covering = singles.find((i) => Math.floor(BOARD[i].price / 2) >= need);
  if (covering !== undefined) return { type: 'mortgage', pid: p.id, idx: covering };
  if (singles.length) return { type: 'mortgage', pid: p.id, idx: singles[0] };
  // 2. постройки — с самых дешёвых
  const sellable = owned.filter((i) => !checks.canSellHouse(st, p.id, i)).sort((a, b) => BOARD[a].house - BOARD[b].house);
  if (sellable.length) return { type: 'sell_house', pid: p.id, idx: sellable[0] };
  // 3. залог клеток монополии
  const rest = owned.filter((i) => !checks.canMortgage(st, p.id, i)).sort((a, b) => BOARD[a].price - BOARD[b].price);
  if (rest.length) return { type: 'mortgage', pid: p.id, idx: rest[0] };
  return { type: 'bankrupt', pid: p.id };
}

// Оценка сделки глазами игрока pid: give — что он отдаёт, recv — что получает, other — контрагент.
export function judgeTrade(st, pid, give, recv, other) {
  const p = st.players.find((x) => x.id === pid);
  let giveV = give.cash + give.cards * 40;
  for (const i of give.props) {
    let v = propValue(st, pid, i);
    if (wouldCompleteGroup(st, other, i)) v *= 1.8;
    giveV += v;
  }
  let recvV = recv.cash + recv.cards * 40;
  for (const i of recv.props) recvV += propValue(st, pid, i);
  const cashAfter = p.cash - give.cash + recv.cash;
  if (cashAfter < reserve(st) * 0.5 && give.cash > 0) return false;
  return recvV >= giveV * 1.1;
}

function evaluateTrade(st, p) {
  const t = st.trade;
  return judgeTrade(st, p.id, t.get, t.give, t.from);
}

// Бот ищет клетку, которой ему не хватает до полной группы, и предлагает за неё деньги или обмен.
function proposeTrade(st, p) {
  if ((st.tradesThisTurn || 0) > 0) return null;
  if (st.turnNo % 2 !== 0) return null;
  const groups = PROP_GROUPS;
  for (const g of groups) {
    const members = groupMembers(g);
    const mine = members.filter((i) => st.props[i].owner === p.id);
    if (mine.length !== members.length - 1) continue;
    const missing = members.find((i) => st.props[i].owner !== p.id);
    const owner = st.props[missing].owner;
    if (!owner) continue;
    const q = st.players.find((x) => x.id === owner);
    if (!q || q.bankrupt) continue;
    if (members.some((i) => st.props[i].houses > 0)) continue;
    const price = BOARD[missing].price;
    // вариант 1: обмен на клетку, которой не хватает контрагенту
    let swap = null;
    for (const g2 of groups) {
      if (g2 === g) continue;
      const m2 = groupMembers(g2);
      const theirs = m2.filter((i) => st.props[i].owner === owner);
      if (theirs.length !== m2.length - 1) continue;
      const need = m2.find((i) => st.props[i].owner !== owner);
      if (st.props[need].owner === p.id && !m2.some((i) => st.props[i].houses > 0)) { swap = need; break; }
    }
    const offers = [];
    if (swap !== null) {
      const diff = Math.max(0, BOARD[missing].price - BOARD[swap].price);
      offers.push({ give: { cash: Math.round(diff * 1.2 / 10) * 10, props: [swap], cards: 0 }, get: { cash: 0, props: [missing], cards: 0 } });
    }
    for (const mult of [1.6, 2, 2.5]) {
      const cash = Math.round(price * mult / 10) * 10;
      if (p.cash - cash >= reserve(st)) offers.push({ give: { cash, props: [], cards: 0 }, get: { cash: 0, props: [missing], cards: 0 } });
    }
    for (const o of offers) {
      if (o.give.cash > p.cash) continue;
      // если контрагент — бот, предлагаем только то, что он примет
      if (q.bot && !judgeTrade(st, owner, o.get, o.give, p.id)) continue;
      return { type: 'trade_offer', pid: p.id, to: owner, give: o.give, get: o.get };
    }
  }
  return null;
}

function auctionMove(st, p) {
  const a = st.auction;
  const sq = BOARD[a.idx];
  const value = propValue(st, p.id, a.idx);
  const maxBid = Math.min(p.cash - reserve(st) * 0.5, Math.floor(value * 1.05));
  const currentBid = a.highest ? a.highest.amount : 0;
  if (a.highest && a.highest.pid === p.id) return { type: 'pass', pid: p.id };
  const step = Math.max(10, Math.round(sq.price * 0.1 / 10) * 10);
  const next = a.highest ? currentBid + step : Math.min(maxBid, Math.max(10, Math.round(sq.price * 0.5 / 10) * 10));
  if (next <= maxBid && next <= p.cash && next > currentBid) return { type: 'bid', pid: p.id, amount: next };
  return { type: 'pass', pid: p.id };
}

export function botAction(st, pid) {
  const p = st.players.find((x) => x.id === pid);
  if (!p || p.bankrupt || !p.bot) return null;
  const legal = legalActions(st, pid);
  if (!legal.length) return null;
  if (st.phase === PHASE.AUCTION) return legal.includes('bid') ? auctionMove(st, p) : null;
  if (st.trade) {
    if (legal.includes('trade_accept')) return { type: evaluateTrade(st, p) ? 'trade_accept' : 'trade_reject', pid };
    return null;
  }
  if (st.phase === PHASE.DEBT) return legal.includes('bankrupt') ? raiseMoney(st, p) : null;
  if (current(st).id !== pid) return null;
  switch (st.phase) {
    case PHASE.ROLL: {
      const b = bestBuild(st, p) || bestUnmortgage(st, p);
      if (b) return b;
      if (legal.includes('trade_offer')) { const t = proposeTrade(st, p); if (t) return t; }
      if (p.inJail) {
        if (legal.includes('jail_card')) return { type: 'jail_card', pid };
        if (legal.includes('jail_pay') && housesOnBoard(st) < 12 && p.cash >= JAIL_FINE + reserve(st)) return { type: 'jail_pay', pid };
      }
      return { type: 'roll', pid };
    }
    case PHASE.BUY: {
      const sq = BOARD[p.pos];
      if (legal.includes('buy')) {
        const value = propValue(st, pid, p.pos);
        if (p.cash - sq.price >= reserve(st) || (value >= sq.price * 1.5 && p.cash >= sq.price)) return { type: 'buy', pid };
      }
      return { type: 'skip_buy', pid };
    }
    case PHASE.TAX: {
      const pct = Math.floor(netWorth(st, pid) * BOARD[p.pos].percent / 100);
      return { type: 'tax', pid, mode: pct < BOARD[p.pos].amount ? 'percent' : 'flat' };
    }
    case PHASE.CARD: return { type: 'ack_card', pid };
    case PHASE.END: {
      const b = bestBuild(st, p) || bestUnmortgage(st, p);
      if (b) return b;
      return { type: 'end_turn', pid };
    }
    default: return null;
  }
}

// Следующий ход бота в текущем состоянии (или null, если ждём человека).
export function nextBotAction(st) {
  for (const pid of whoActs(st)) {
    const a = botAction(st, pid);
    if (a) return a;
  }
  return null;
}

// Задержка «на подумать», чтобы ход бота читался на экране.
export function botDelay(action) {
  switch (action.type) {
    case 'roll': return 900;
    case 'end_turn': return 700;
    case 'ack_card': return 1800;
    case 'buy': case 'skip_buy': return 1100;
    case 'bid': case 'pass': return 800;
    case 'trade_accept': case 'trade_reject': return 1500;
    case 'trade_offer': return 1200;
    default: return 500;
  }
}
