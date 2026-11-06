import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, applyAction, PHASE, legalActions, rentFor, netWorth, liquidValue, EngineError, whoActs } from '../js/engine.js';
import { BOARD, N, JAIL_POS, CARD_BY_ID, sqName, term, botNames, idxOf, deckName } from '../js/data.js';
import { RU } from '../js/ru.js';

// rng that produces an exact dice sequence: diceRng([3,4, 1,1]) → 3:4 then 1:1
function diceRng(values) {
  let i = 0;
  return () => { const v = values[i++]; if (v === undefined) throw new Error('rng exhausted'); return (v - 1 + 0.5) / 6; };
}
function game(n = 2, settings = {}, seed = 1) {
  const players = Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}`, token: 'cap' }));
  return createGame({ players, settings, seed });
}
function act(st, type, pid, extra = {}, rng) { return applyAction(st, { type, pid, ...extra }, rng); }
function giveProp(st, idx, pid) { st.props[idx].owner = pid; }

const WATTS = idxOf('Watts'), ROSCOE = idxOf("Roscoe's Chicken & Waffles"), OAKLAND = idxOf('Oakland'), ECHO = idxOf('Echo Park');
const PAWN = idxOf('Pawn Shop'), LIQUOR = idxOf('Liquor Store'), SWAP = idxOf('Swap Meet'), NAIL = idxOf('Nail Salon'), BARBER = idxOf('Barbershop');
const CRENSHAW = idxOf('Crenshaw'), SLAUSON = idxOf('Slauson'), INGLEWOOD = idxOf('Inglewood');
const BALDWIN = idxOf('Baldwin Hills'), BEVERLY = idxOf('Beverly Hills'), TAX = idxOf('Tax Evasion'), ROBBED = idxOf('Robbed');
const PARKING = idxOf('Free Parking'), DRIVEBY = idxOf('Drive-By'), CARJACK = idxOf('Car Jacking');

test('доска из фильма: 48 клеток, 11 на сторону, углы на местах', () => {
  assert.equal(N, 48);
  assert.equal(BOARD[0].type, 'go');
  assert.equal(JAIL_POS, 12);
  assert.equal(BOARD[24].type, 'parking');
  assert.equal(BOARD[36].type, 'gotojail');
  // порядок стороны, которая видна в кадре
  assert.deepEqual(BOARD.slice(1, 12).map((s) => s.name), ['Westchester', 'No Chance', 'Oakland', 'Robbed', 'Tax Evasion', 'Echo Park', 'Community Service', 'Alvarado', 'Florence', 'Pawn Shop', 'Normandie']);
  assert.deepEqual(BOARD.slice(45).map((s) => s.name), ['Drive-By', "Roscoe's Chicken & Waffles", 'Watts']);
  for (const sq of BOARD) if (sq.type === 'prop') assert.equal(sq.rent.length, 6, sq.name);
  const st = game(2);
  assert.equal(Object.keys(st.props).length, BOARD.filter((s) => ['prop', 'rail', 'util'].includes(s.type)).length);
});

test('создание игры', () => {
  const st = game(3);
  assert.equal(st.players.length, 3);
  assert.equal(st.players[0].cash, 1500);
  assert.equal(st.phase, PHASE.ROLL);
  assert.throws(() => createGame({ players: [{ name: 'x' }] }), EngineError);
});

test('бросок, движение и зарплата за СТАРТ', () => {
  const st = game();
  act(st, 'roll', 'p1', {}, diceRng([3, 4]));
  assert.equal(st.players[0].pos, 7); // Community Service
  assert.equal(st.phase, PHASE.CARD);
  const st2 = game();
  st2.players[0].pos = ROSCOE;
  act(st2, 'roll', 'p1', {}, diceRng([2, 1]));
  assert.equal(st2.players[0].pos, 1); // Westchester
  assert.equal(st2.players[0].cash, 1700);
  assert.equal(st2.phase, PHASE.BUY);
});

test('покупка и отказ с аукционом', () => {
  const st = game(3);
  act(st, 'roll', 'p1', {}, diceRng([1, 2])); // Oakland
  assert.equal(st.phase, PHASE.BUY);
  assert.ok(legalActions(st, 'p1').includes('buy'));
  act(st, 'buy', 'p1');
  assert.equal(st.props[OAKLAND].owner, 'p1');
  assert.equal(st.players[0].cash, 1500 - BOARD[OAKLAND].price);
  assert.equal(st.phase, PHASE.END);
  act(st, 'end_turn', 'p1');
  assert.equal(st.cur, 1);
  act(st, 'roll', 'p2', {}, diceRng([2, 4])); // Echo Park
  act(st, 'skip_buy', 'p2');
  assert.equal(st.phase, PHASE.AUCTION);
  assert.equal(st.auction.turnPid, 'p3');
  assert.throws(() => act(st, 'bid', 'p1', { amount: 10 }), EngineError);
  act(st, 'bid', 'p3', { amount: 50 });
  assert.equal(st.auction.turnPid, 'p1');
  act(st, 'bid', 'p1', { amount: 80 });
  assert.throws(() => act(st, 'bid', 'p2', { amount: 80 }), EngineError);
  act(st, 'pass', 'p2');
  act(st, 'pass', 'p3');
  assert.equal(st.auction, null);
  assert.equal(st.props[ECHO].owner, 'p1');
  assert.equal(st.players[0].cash, 1500 - BOARD[OAKLAND].price - 80);
  assert.equal(st.phase, PHASE.END);
  assert.equal(st.cur, 1);
});

test('аукцион без ставок', () => {
  const st = game(2);
  act(st, 'roll', 'p1', {}, diceRng([1, 2]));
  act(st, 'skip_buy', 'p1');
  act(st, 'pass', 'p2');
  assert.equal(st.auction.turnPid, 'p1');
  act(st, 'pass', 'p1');
  assert.equal(st.auction, null);
  assert.equal(st.props[OAKLAND].owner, null);
  assert.equal(st.phase, PHASE.END);
});

test('аренда: обычная, монополия, постройки, точки, салоны', () => {
  const st = game(2);
  giveProp(st, WATTS, 'p2');
  assert.equal(rentFor(st, WATTS, 7), 2);
  giveProp(st, ROSCOE, 'p2');
  assert.equal(rentFor(st, WATTS, 7), 4); // монополия ×2
  st.props[WATTS].houses = 3;
  assert.equal(rentFor(st, WATTS, 7), 90);
  giveProp(st, PAWN, 'p2');
  assert.equal(rentFor(st, PAWN, 7), 25);
  giveProp(st, LIQUOR, 'p2'); giveProp(st, SWAP, 'p2');
  assert.equal(rentFor(st, PAWN, 7), 100);
  assert.equal(rentFor(st, PAWN, 7, { double: true }), 200);
  giveProp(st, NAIL, 'p2');
  assert.equal(rentFor(st, NAIL, 7), 28);
  giveProp(st, BARBER, 'p2');
  assert.equal(rentFor(st, NAIL, 7), 70);
  st.props[NAIL].mortgaged = true;
  assert.equal(rentFor(st, NAIL, 7), 0);
  const st2 = game(2);
  giveProp(st2, ECHO, 'p2');
  act(st2, 'roll', 'p1', {}, diceRng([2, 4]));
  assert.equal(st2.players[0].cash, 1490);
  assert.equal(st2.players[1].cash, 1510);
  assert.equal(st2.phase, PHASE.END);
});

test('залог и выкуп', () => {
  const st = game(2);
  giveProp(st, OAKLAND, 'p1');
  act(st, 'mortgage', 'p1', { idx: OAKLAND });
  assert.equal(st.players[0].cash, 1560);
  assert.equal(st.props[OAKLAND].mortgaged, true);
  assert.throws(() => act(st, 'mortgage', 'p1', { idx: OAKLAND }), EngineError);
  act(st, 'unmortgage', 'p1', { idx: OAKLAND });
  assert.equal(st.players[0].cash, 1560 - 66);
  assert.equal(st.props[OAKLAND].mortgaged, false);
  assert.throws(() => act(st, 'mortgage', 'p2', { idx: OAKLAND }), EngineError);
});

test('строительство: монополия, равномерность, продажа', () => {
  const st = game(2);
  giveProp(st, WATTS, 'p1');
  assert.throws(() => act(st, 'build', 'p1', { idx: WATTS }), /группа/);
  giveProp(st, ROSCOE, 'p1');
  act(st, 'build', 'p1', { idx: WATTS });
  assert.equal(st.props[WATTS].houses, 1);
  assert.equal(st.players[0].cash, 1450);
  assert.throws(() => act(st, 'build', 'p1', { idx: WATTS }), /равномерно/);
  act(st, 'build', 'p1', { idx: ROSCOE });
  for (let k = 0; k < 4; k++) { act(st, 'build', 'p1', { idx: WATTS }); act(st, 'build', 'p1', { idx: ROSCOE }); }
  assert.equal(st.props[WATTS].houses, 5);
  assert.throws(() => act(st, 'build', 'p1', { idx: WATTS }), /особняк/);
  assert.throws(() => act(st, 'mortgage', 'p1', { idx: WATTS }), /постройки/);
  act(st, 'sell_house', 'p1', { idx: WATTS });
  assert.equal(st.props[WATTS].houses, 4);
  assert.throws(() => act(st, 'sell_house', 'p1', { idx: WATTS }), /равномерно/);
  assert.equal(st.players[0].cash, 1500 - 10 * 50 + 25);
});

test('три дубля → больница; выход за деньги, по карте, по дублю, на третий раз', () => {
  const st = game(2);
  act(st, 'roll', 'p1', {}, diceRng([1, 1])); // 2 — No Chance
  assert.equal(st.phase, PHASE.CARD);
  act(st, 'ack_card', 'p1');
  if (st.phase === PHASE.BUY) act(st, 'skip_buy', 'p1');
  while (st.auction) act(st, 'pass', st.auction.turnPid);
  if (st.phase === PHASE.TAX) act(st, 'tax', 'p1', { mode: 'flat' });
  act(st, 'end_turn', 'p1');
  assert.equal(st.cur, 0); // дубль — ходит снова
  assert.equal(st.phase, PHASE.ROLL);
  st.players[0].pos = JAIL_POS; st.players[0].inJail = false;
  act(st, 'roll', 'p1', {}, diceRng([6, 6])); // 24 Free Parking
  assert.equal(st.phase, PHASE.END);
  act(st, 'end_turn', 'p1');
  act(st, 'roll', 'p1', {}, diceRng([2, 2]));
  assert.equal(st.players[0].inJail, true);
  assert.equal(st.players[0].pos, JAIL_POS);
  assert.equal(st.phase, PHASE.END);
  act(st, 'end_turn', 'p1');
  assert.equal(st.cur, 1);
  act(st, 'roll', 'p2', {}, diceRng([2, 3])); // 5 Tax Evasion
  act(st, 'tax', 'p2', { mode: 'flat' });
  act(st, 'end_turn', 'p2');
  assert.ok(legalActions(st, 'p1').includes('jail_pay'));
  const before = st.players[0].cash;
  act(st, 'jail_pay', 'p1');
  assert.equal(st.players[0].inJail, false);
  assert.equal(st.players[0].cash, before - 50);
  assert.equal(st.phase, PHASE.ROLL);
  act(st, 'roll', 'p1', {}, diceRng([1, 2])); // 15 Slauson
  assert.equal(st.players[0].pos, SLAUSON);
  // карта выписки
  const st2 = game(2);
  st2.players[0].inJail = true; st2.players[0].pos = JAIL_POS; st2.players[0].jailCards = ['c7'];
  act(st2, 'jail_card', 'p1');
  assert.equal(st2.players[0].inJail, false);
  assert.ok(st2.decks.chance.includes('c7'));
  // дубль в больнице
  const st3 = game(2);
  st3.players[0].inJail = true; st3.players[0].pos = JAIL_POS;
  act(st3, 'roll', 'p1', {}, diceRng([3, 3]));
  assert.equal(st3.players[0].inJail, false);
  assert.equal(st3.players[0].pos, 18); // Compton
  assert.equal(st3.doubles, 0);
  act(st3, 'skip_buy', 'p1'); act(st3, 'pass', 'p2'); act(st3, 'pass', 'p1');
  act(st3, 'end_turn', 'p1');
  assert.equal(st3.cur, 1); // после выхода по дублю повторного броска нет
  // третья неудачная попытка: на третий раз платит $50 и идёт по кубикам
  const st4 = game(2);
  st4.players[0].inJail = true; st4.players[0].pos = JAIL_POS;
  act(st4, 'roll', 'p1', {}, diceRng([1, 2]));
  assert.equal(st4.players[0].inJail, true); assert.equal(st4.phase, PHASE.END);
  act(st4, 'end_turn', 'p1');
  act(st4, 'roll', 'p2', {}, diceRng([1, 3])); act(st4, 'end_turn', 'p2'); // p2: 4 Robbed, −$100
  act(st4, 'roll', 'p1', {}, diceRng([1, 2])); act(st4, 'end_turn', 'p1');
  act(st4, 'roll', 'p2', {}, diceRng([2, 6])); act(st4, 'end_turn', 'p2'); // p2: 12, в гостях
  assert.equal(st4.cur, 0);
  act(st4, 'roll', 'p1', {}, diceRng([1, 2]));
  assert.equal(st4.players[0].inJail, false);
  assert.equal(st4.players[0].pos, SLAUSON);
  assert.equal(st4.players[0].cash, 1450);
  assert.equal(st4.phase, PHASE.BUY);
});

test('Drive-By: пропуск следующего хода; Car Jacking: в больницу', () => {
  const s2 = game(3);
  s2.players[0].pos = 43;
  act(s2, 'roll', 'p1', {}, diceRng([1, 1])); // 45 Drive-By (дубль не даёт повторный бросок)
  assert.equal(s2.players[0].pos, DRIVEBY);
  assert.equal(s2.players[0].skip, true);
  assert.equal(s2.phase, PHASE.END);
  assert.equal(s2.doubles, 0);
  act(s2, 'end_turn', 'p1');
  assert.equal(s2.cur, 1);
  act(s2, 'roll', 'p2', {}, diceRng([1, 3])); act(s2, 'end_turn', 'p2'); // Robbed
  act(s2, 'roll', 'p3', {}, diceRng([1, 3])); act(s2, 'end_turn', 'p3');
  assert.equal(s2.cur, 1, 'p1 пропускает ход');
  assert.equal(s2.players[0].skip, false);
  act(s2, 'roll', 'p2', {}, diceRng([2, 6])); act(s2, 'end_turn', 'p2'); // 12, в гостях
  act(s2, 'roll', 'p3', {}, diceRng([2, 6])); act(s2, 'end_turn', 'p3');
  assert.equal(s2.cur, 0);
  // Car Jacking → County Hospital
  const s3 = game(2);
  s3.players[0].pos = 33;
  act(s3, 'roll', 'p1', {}, diceRng([1, 2]));
  assert.equal(s3.players[0].inJail, true);
  assert.equal(s3.players[0].pos, JAIL_POS);
});

test('карточки: все эффекты', () => {
  const run = (id, setup) => {
    const st = game(3);
    setup && setup(st);
    st.card = { deck: id.startsWith('c') ? 'chance' : 'chest', id };
    st.phase = PHASE.CARD;
    st.dice = [2, 5];
    const ev = act(st, 'ack_card', 'p1');
    return { st, ev };
  };
  let r = run('c1', (st) => { st.players[0].pos = 7; });
  assert.equal(r.st.players[0].pos, 0); assert.equal(r.st.players[0].cash, 1700);
  r = run('c2', (st) => { st.players[0].pos = 26; }); // Compton за СТАРТом
  assert.equal(r.st.players[0].pos, 18); assert.equal(r.st.players[0].cash, 1700); assert.equal(r.st.phase, PHASE.BUY);
  r = run('c8', (st) => { st.players[0].pos = 7; });
  assert.equal(r.st.players[0].pos, ROBBED); assert.equal(r.st.players[0].cash, 1400); assert.equal(r.st.phase, PHASE.END);
  r = run('c5', (st) => { st.players[0].pos = 7; st.props[PAWN].owner = 'p2'; });
  assert.equal(r.st.players[0].pos, PAWN); assert.equal(r.st.players[0].cash, 1450); assert.equal(r.st.players[1].cash, 1550);
  r = run('c4', (st) => { st.players[0].pos = 26; st.props[BARBER].owner = 'p2'; });
  assert.equal(r.st.players[0].pos, BARBER);
  const dice = r.st.dice; assert.equal(r.st.players[1].cash - 1500, 10 * (dice[0] + dice[1]));
  r = run('c6'); assert.equal(r.st.players[0].cash, 1550);
  r = run('c11'); assert.equal(r.st.players[0].cash, 1485);
  r = run('c14'); assert.equal(r.st.players[0].cash, 1400); assert.equal(r.st.players[1].cash, 1550); assert.equal(r.st.players[2].cash, 1550);
  r = run('s7'); assert.equal(r.st.players[0].cash, 1520); assert.equal(r.st.players[1].cash, 1490);
  r = run('c7'); assert.deepEqual(r.st.players[0].jailCards, ['c7']);
  r = run('c9', (st) => { st.players[0].pos = 42; }); assert.equal(r.st.players[0].inJail, true); assert.equal(r.st.players[0].cash, 1500);
  r = run('c10', (st) => { st.props[WATTS].owner = 'p1'; st.props[ROSCOE].owner = 'p1'; st.props[WATTS].houses = 5; st.props[ROSCOE].houses = 2; });
  assert.equal(r.st.players[0].cash, 1500 - 100 - 50);
  r = run('s14', (st) => { st.props[WATTS].owner = 'p1'; st.props[ROSCOE].owner = 'p1'; st.props[WATTS].houses = 1; st.props[ROSCOE].houses = 1; });
  assert.equal(r.st.players[0].cash, 1420);
  r = run('c13', (st) => { st.players[0].pos = 42; }); assert.equal(r.st.players[0].pos, BEVERLY); assert.equal(r.st.phase, PHASE.BUY);
  r = run('c12', (st) => { st.players[0].pos = 42; }); assert.equal(r.st.players[0].pos, PAWN); assert.equal(r.st.players[0].cash, 1700);
});

test('Tax Evasion: 10% или фикс', () => {
  const st = game(2);
  giveProp(st, BEVERLY, 'p1'); st.props[BEVERLY].houses = 2;
  st.players[0].pos = TAX; st.phase = PHASE.TAX;
  const worth = 1500 + BOARD[BEVERLY].price + 2 * BOARD[BEVERLY].house;
  assert.equal(netWorth(st, 'p1'), worth);
  act(st, 'tax', 'p1', { mode: 'percent' });
  assert.equal(st.players[0].cash, 1500 - Math.floor(worth / 10));
  const st2 = game(2);
  st2.players[0].pos = TAX; st2.phase = PHASE.TAX;
  act(st2, 'tax', 'p1', { mode: 'flat' });
  assert.equal(st2.players[0].cash, 1300);
});

test('долг → залог → автооплата; банкротство → имущество кредитору; победа', () => {
  const st = game(2);
  giveProp(st, BEVERLY, 'p2'); giveProp(st, BALDWIN, 'p2'); st.props[BEVERLY].houses = 5;
  giveProp(st, WATTS, 'p1'); giveProp(st, PAWN, 'p1');
  st.players[0].cash = 100; st.players[0].pos = 42;
  act(st, 'roll', 'p1', {}, diceRng([1, 1])); // 44 Beverly Hills с особняком
  assert.equal(st.phase, PHASE.DEBT);
  assert.equal(st.debt.amount, BOARD[BEVERLY].rent[5]);
  assert.ok(legalActions(st, 'p1').includes('bankrupt'));
  assert.ok(!legalActions(st, 'p1').includes('roll'));
  act(st, 'mortgage', 'p1', { idx: PAWN });
  assert.equal(st.phase, PHASE.DEBT);
  act(st, 'bankrupt', 'p1');
  assert.equal(st.players[0].bankrupt, true);
  assert.equal(st.props[WATTS].owner, 'p2');
  assert.equal(st.props[PAWN].owner, 'p2');
  assert.equal(st.props[PAWN].mortgaged, true);
  assert.equal(st.players[1].cash, 1500 + 100 + 100);
  assert.equal(st.phase, PHASE.OVER);
  assert.equal(st.winner, 'p2');
  // долг, который можно закрыть
  const st2 = game(2);
  giveProp(st2, CRENSHAW, 'p2'); giveProp(st2, SLAUSON, 'p2'); giveProp(st2, INGLEWOOD, 'p2'); st2.props[CRENSHAW].houses = 2;
  giveProp(st2, BEVERLY, 'p1');
  st2.players[0].cash = 100; st2.players[0].pos = 1;
  act(st2, 'roll', 'p1', {}, diceRng([6, 6])); // 13 Crenshaw
  const rent = BOARD[CRENSHAW].rent[2];
  assert.equal(st2.phase, PHASE.DEBT); assert.equal(st2.debt.amount, rent);
  assert.equal(liquidValue(st2, 'p1'), 100 + BOARD[BEVERLY].price / 2);
  assert.throws(() => act(st2, 'bankrupt', 'p1'), /ещё можете/);
  act(st2, 'mortgage', 'p1', { idx: BEVERLY });
  assert.equal(st2.phase, PHASE.END);
  assert.equal(st2.players[0].cash, 100 + BOARD[BEVERLY].price / 2 - rent);
  assert.equal(st2.players[1].cash, 1500 + rent);
});

test('сделки', () => {
  const st = game(3);
  giveProp(st, WATTS, 'p1'); giveProp(st, ROSCOE, 'p2'); giveProp(st, OAKLAND, 'p2');
  assert.throws(() => act(st, 'trade_offer', 'p1', { to: 'p2', give: { cash: 5000 }, get: {} }), /наличных/);
  assert.throws(() => act(st, 'trade_offer', 'p1', { to: 'p2', give: { props: [ROSCOE] }, get: {} }), /не владеет/);
  act(st, 'trade_offer', 'p1', { to: 'p2', give: { cash: 100, props: [WATTS] }, get: { props: [ROSCOE, OAKLAND] } });
  assert.ok(st.trade);
  assert.deepEqual(whoActs(st), ['p2']);
  assert.ok(!legalActions(st, 'p1').includes('roll'));
  assert.ok(legalActions(st, 'p2').includes('trade_accept'));
  act(st, 'trade_accept', 'p2');
  assert.equal(st.props[WATTS].owner, 'p2'); assert.equal(st.props[ROSCOE].owner, 'p1'); assert.equal(st.props[OAKLAND].owner, 'p1');
  assert.equal(st.players[0].cash, 1400); assert.equal(st.players[1].cash, 1600);
  assert.equal(st.trade, null);
  act(st, 'trade_offer', 'p1', { to: 'p3', give: { cash: 10 }, get: {} });
  act(st, 'trade_reject', 'p3');
  assert.equal(st.trade, null);
  act(st, 'trade_offer', 'p1', { to: 'p3', give: { cash: 10 }, get: {} });
  act(st, 'trade_cancel', 'p1');
  assert.equal(st.trade, null);
  st.props[ROSCOE].houses = 1;
  assert.throws(() => act(st, 'trade_offer', 'p1', { to: 'p3', give: { props: [ROSCOE] }, get: {} }), /постройки/);
});

test('сдача и правило Free Parking', () => {
  const st = game(3, { freeParkingPool: true });
  st.players[0].pos = TAX; st.phase = PHASE.TAX;
  act(st, 'tax', 'p1', { mode: 'flat' });
  assert.equal(st.pool, 200);
  act(st, 'end_turn', 'p1');
  st.players[1].pos = 19;
  act(st, 'roll', 'p2', {}, diceRng([2, 3])); // 24 Free Parking
  assert.equal(st.players[1].pos, PARKING);
  assert.equal(st.players[1].cash, 1700); assert.equal(st.pool, 0);
  act(st, 'surrender', 'p2');
  assert.equal(st.players[1].bankrupt, true);
  assert.equal(st.cur, 2);
  assert.equal(st.phase, PHASE.ROLL);
});

test('детерминированность по seed', () => {
  const a = game(2, {}, 42), b = game(2, {}, 42);
  for (let k = 0; k < 5; k++) {
    for (const st of [a, b]) {
      const pid = st.players[st.cur].id;
      let legal = legalActions(st, pid);
      if (legal.includes('roll')) act(st, 'roll', pid);
      legal = legalActions(st, pid);
      if (legal.includes('ack_card')) act(st, 'ack_card', pid);
      legal = legalActions(st, pid);
      if (legal.includes('tax')) act(st, 'tax', pid, { mode: 'flat' });
      legal = legalActions(st, pid);
      if (legal.includes('buy')) act(st, 'buy', pid);
      else if (legal.includes('skip_buy')) { act(st, 'skip_buy', pid); while (st.auction) act(st, 'pass', st.auction.turnPid); }
      legal = legalActions(st, pid);
      if (legal.includes('end_turn')) act(st, 'end_turn', pid);
    }
    assert.deepEqual(a.dice, b.dice);
  }
  assert.equal(JSON.stringify(a.players), JSON.stringify(b.players));
});

test('liquidValue учитывает постройки и залог', () => {
  const st = game(2);
  giveProp(st, WATTS, 'p1'); giveProp(st, ROSCOE, 'p1'); st.props[WATTS].houses = 2; st.props[ROSCOE].mortgaged = true;
  assert.equal(liquidValue(st, 'p1'), 1500 + 30 + 50);
});

test('полная русификация: названия, колоды и карточки в логе по-русски', () => {
  const st = createGame({ players: [{ name: 'Вася' }, { name: 'Петя' }], settings: { lang: 'ru' }, seed: 3 });
  act(st, 'roll', 'p1', {}, diceRng([1, 2])); // Oakland
  assert.equal(sqName(st, OAKLAND), RU.squares[OAKLAND].ru);
  assert.match(st.log[st.log.length - 1].t, new RegExp(RU.squares[OAKLAND].ru));
  act(st, 'buy', 'p1'); act(st, 'end_turn', 'p1');
  act(st, 'roll', 'p2', {}, diceRng([1, 1])); // 2 — No Chance
  const last = st.log[st.log.length - 1].t;
  assert.ok(last.includes(deckName(st, st.card.deck)), last);
  assert.ok(last.includes(RU.cards[st.card.id]), last);
  act(st, 'ack_card', 'p2');
  const p = st.players[1]; p.inJail = true; p.pos = JAIL_POS; st.phase = PHASE.ROLL; st.cur = 1; st.doubles = 0; st.trade = null; st.debt = null;
  act(st, 'jail_pay', 'p2');
  assert.match(st.log[st.log.length - 1].t, new RegExp(RU.terms.hospitalFrom));
  const joined = st.log.map((l) => l.t).join('\n');
  const hit = joined.match(/.{0,30}[A-Za-z].{0,30}/);
  assert.ok(!hit, 'латиница в логе: ' + (hit ? hit[0] : ''));
  const en = createGame({ players: [{ name: 'A' }, { name: 'B' }], seed: 3 });
  delete en.settings.lang;
  assert.equal(sqName(en, ROSCOE), "Roscoe's Chicken & Waffles");
  assert.equal(term(en, 'hospital'), 'County Hospital');
  assert.equal(botNames('ru').length, 8);
  for (let i = 0; i < N; i++) { assert.ok(RU.squares[i] && RU.squares[i].ru && RU.squares[i].ruShort, `клетка ${i}`); assert.ok(!/[A-Za-z]/.test(RU.squares[i].ru + RU.squares[i].ruShort), `латиница в клетке ${i}`); }
  for (const id of Object.keys(CARD_BY_ID)) assert.ok(RU.cards[id] && !/[A-Za-z]/.test(RU.cards[id]), `карточка ${id}`);
});
