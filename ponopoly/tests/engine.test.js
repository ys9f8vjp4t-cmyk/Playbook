import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, applyAction, PHASE, legalActions, rentFor, netWorth, liquidValue, EngineError, whoActs, mulberry32 } from '../js/engine.js';
import { BOARD, JAIL_POS, CARD_BY_ID } from '../js/data.js';

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

test('создание игры', () => {
  const st = game(3);
  assert.equal(st.players.length, 3);
  assert.equal(st.players[0].cash, 1500);
  assert.equal(st.phase, PHASE.ROLL);
  assert.equal(Object.keys(st.props).length, 28);
  assert.throws(() => createGame({ players: [{ name: 'x' }] }), EngineError);
});

test('бросок, движение и зарплата за СТАРТ', () => {
  const st = game();
  act(st, 'roll', 'p1', {}, diceRng([3, 4]));
  assert.equal(st.players[0].pos, 7); // No Chance
  assert.equal(st.phase, PHASE.CARD);
  const st2 = game();
  st2.players[0].pos = 38;
  act(st2, 'roll', 'p1', {}, diceRng([2, 1]));
  assert.equal(st2.players[0].pos, 1);
  assert.equal(st2.players[0].cash, 1500 + 200 - 0); // Watts свободна, фаза BUY
  assert.equal(st2.phase, PHASE.BUY);
});

test('покупка и отказ с аукционом', () => {
  const st = game(3);
  act(st, 'roll', 'p1', {}, diceRng([1, 2])); // Roscoe's (3)
  assert.equal(st.phase, PHASE.BUY);
  assert.ok(legalActions(st, 'p1').includes('buy'));
  act(st, 'buy', 'p1');
  assert.equal(st.props[3].owner, 'p1');
  assert.equal(st.players[0].cash, 1440);
  assert.equal(st.phase, PHASE.END);
  act(st, 'end_turn', 'p1');
  assert.equal(st.cur, 1);
  act(st, 'roll', 'p2', {}, diceRng([2, 4])); // Crenshaw (6)
  act(st, 'skip_buy', 'p2');
  assert.equal(st.phase, PHASE.AUCTION);
  assert.equal(st.auction.turnPid, 'p3');
  assert.throws(() => act(st, 'bid', 'p1', { amount: 10 }), EngineError); // не его очередь
  act(st, 'bid', 'p3', { amount: 50 });
  assert.equal(st.auction.turnPid, 'p1');
  act(st, 'bid', 'p1', { amount: 80 });
  assert.throws(() => act(st, 'bid', 'p2', { amount: 80 }), EngineError); // ставка не выше
  act(st, 'pass', 'p2');
  act(st, 'pass', 'p3');
  assert.equal(st.auction, null);
  assert.equal(st.props[6].owner, 'p1');
  assert.equal(st.players[0].cash, 1440 - 80);
  assert.equal(st.phase, PHASE.END);
  assert.equal(st.cur, 1); // ход всё ещё у p2
});

test('аукцион без ставок', () => {
  const st = game(2);
  act(st, 'roll', 'p1', {}, diceRng([1, 2]));
  act(st, 'skip_buy', 'p1');
  act(st, 'pass', 'p2');
  assert.equal(st.auction.turnPid, 'p1');
  act(st, 'pass', 'p1');
  assert.equal(st.auction, null);
  assert.equal(st.props[3].owner, null);
  assert.equal(st.phase, PHASE.END);
});

test('аренда: обычная, монополия, постройки, точки, салоны', () => {
  const st = game(2);
  giveProp(st, 1, 'p2');
  assert.equal(rentFor(st, 1, 7), 2);
  giveProp(st, 3, 'p2');
  assert.equal(rentFor(st, 1, 7), 4); // монополия ×2
  st.props[1].houses = 3;
  assert.equal(rentFor(st, 1, 7), 90);
  giveProp(st, 5, 'p2');
  assert.equal(rentFor(st, 5, 7), 25);
  giveProp(st, 15, 'p2'); giveProp(st, 25, 'p2');
  assert.equal(rentFor(st, 5, 7), 100);
  assert.equal(rentFor(st, 5, 7, { double: true }), 200);
  giveProp(st, 12, 'p2');
  assert.equal(rentFor(st, 12, 7), 28);
  giveProp(st, 28, 'p2');
  assert.equal(rentFor(st, 12, 7), 70);
  st.props[12].mortgaged = true;
  assert.equal(rentFor(st, 12, 7), 0);
  // игрок платит аренду при попадании
  const st2 = game(2);
  giveProp(st2, 6, 'p2');
  act(st2, 'roll', 'p1', {}, diceRng([2, 4]));
  assert.equal(st2.players[0].cash, 1494);
  assert.equal(st2.players[1].cash, 1506);
  assert.equal(st2.phase, PHASE.END);
});

test('залог и выкуп', () => {
  const st = game(2);
  giveProp(st, 6, 'p1');
  act(st, 'mortgage', 'p1', { idx: 6 });
  assert.equal(st.players[0].cash, 1550);
  assert.equal(st.props[6].mortgaged, true);
  assert.throws(() => act(st, 'mortgage', 'p1', { idx: 6 }), EngineError);
  act(st, 'unmortgage', 'p1', { idx: 6 });
  assert.equal(st.players[0].cash, 1550 - 55);
  assert.equal(st.props[6].mortgaged, false);
  assert.throws(() => act(st, 'mortgage', 'p2', { idx: 6 }), EngineError);
});

test('строительство: монополия, равномерность, продажа', () => {
  const st = game(2);
  giveProp(st, 1, 'p1');
  assert.throws(() => act(st, 'build', 'p1', { idx: 1 }), /группа/);
  giveProp(st, 3, 'p1');
  act(st, 'build', 'p1', { idx: 1 });
  assert.equal(st.props[1].houses, 1);
  assert.equal(st.players[0].cash, 1450);
  assert.throws(() => act(st, 'build', 'p1', { idx: 1 }), /равномерно/);
  act(st, 'build', 'p1', { idx: 3 });
  for (let k = 0; k < 4; k++) { act(st, 'build', 'p1', { idx: 1 }); act(st, 'build', 'p1', { idx: 3 }); }
  assert.equal(st.props[1].houses, 5);
  assert.throws(() => act(st, 'build', 'p1', { idx: 1 }), /особняк/);
  assert.throws(() => act(st, 'mortgage', 'p1', { idx: 1 }), /постройки/);
  act(st, 'sell_house', 'p1', { idx: 1 });
  assert.equal(st.props[1].houses, 4);
  assert.throws(() => act(st, 'sell_house', 'p1', { idx: 1 }), /равномерно/);
  assert.equal(st.players[0].cash, 1500 - 10 * 50 + 25);
});

test('три дубля → больница; выход за деньги, по карте, по дублю, на третий раз', () => {
  const st = game(2);
  act(st, 'roll', 'p1', {}, diceRng([1, 1])); // 2 — Community Service
  assert.equal(st.phase, PHASE.CARD);
  act(st, 'ack_card', 'p1');
  act(st, 'end_turn', 'p1');
  assert.equal(st.cur, 0); // дубль — ходит снова
  assert.equal(st.phase, PHASE.ROLL);
  // поставим на безопасную клетку и бросим второй и третий дубль
  st.players[0].pos = 10; st.players[0].inJail = false;
  act(st, 'roll', 'p1', {}, diceRng([5, 5])); // 20 Free Parking
  act(st, 'end_turn', 'p1');
  act(st, 'roll', 'p1', {}, diceRng([2, 2]));
  assert.equal(st.players[0].inJail, true);
  assert.equal(st.players[0].pos, JAIL_POS);
  assert.equal(st.phase, PHASE.END);
  act(st, 'end_turn', 'p1');
  assert.equal(st.cur, 1);
  act(st, 'roll', 'p2', {}, diceRng([1, 3])); // 4 Tax Evasion
  act(st, 'tax', 'p2', { mode: 'flat' });
  act(st, 'end_turn', 'p2');
  // p1 в больнице: платит
  assert.ok(legalActions(st, 'p1').includes('jail_pay'));
  const before = st.players[0].cash;
  act(st, 'jail_pay', 'p1');
  assert.equal(st.players[0].inJail, false);
  assert.equal(st.players[0].cash, before - 50);
  assert.equal(st.phase, PHASE.ROLL);
  act(st, 'roll', 'p1', {}, diceRng([1, 2])); // 13 Alvarado
  assert.equal(st.players[0].pos, 13);
  // карта выписки
  const st2 = game(2);
  st2.players[0].inJail = true; st2.players[0].pos = 10; st2.players[0].jailCards = ['c7'];
  act(st2, 'jail_card', 'p1');
  assert.equal(st2.players[0].inJail, false);
  assert.ok(st2.decks.chance.includes('c7'));
  // дубль в больнице
  const st3 = game(2);
  st3.players[0].inJail = true; st3.players[0].pos = 10;
  act(st3, 'roll', 'p1', {}, diceRng([3, 3]));
  assert.equal(st3.players[0].inJail, false);
  assert.equal(st3.players[0].pos, 16);
  assert.equal(st3.doubles, 0);
  act(st3, 'skip_buy', 'p1'); act(st3, 'pass', 'p2'); act(st3, 'pass', 'p1');
  act(st3, 'end_turn', 'p1');
  assert.equal(st3.cur, 1); // после выхода по дублю повторного броска нет
  // третья неудачная попытка: на третий раз платит $50 и идёт по кубикам
  const st4 = game(2);
  st4.players[0].inJail = true; st4.players[0].pos = 10;
  act(st4, 'roll', 'p1', {}, diceRng([1, 2]));
  assert.equal(st4.players[0].inJail, true); assert.equal(st4.phase, PHASE.END);
  act(st4, 'end_turn', 'p1');
  act(st4, 'roll', 'p2', {}, diceRng([4, 6])); act(st4, 'end_turn', 'p2'); // p2: 10, в гостях
  act(st4, 'roll', 'p1', {}, diceRng([1, 2])); act(st4, 'end_turn', 'p1');
  act(st4, 'roll', 'p2', {}, diceRng([4, 6])); act(st4, 'end_turn', 'p2'); // p2: 20, Free Parking
  assert.equal(st4.cur, 0);
  act(st4, 'roll', 'p1', {}, diceRng([1, 2]));
  assert.equal(st4.players[0].inJail, false);
  assert.equal(st4.players[0].pos, 13);
  assert.equal(st4.players[0].cash, 1450);
  assert.equal(st4.phase, PHASE.BUY);
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
  r = run('c2', (st) => { st.players[0].pos = 22; }); // Compton за СТАРТом
  assert.equal(r.st.players[0].pos, 19); assert.equal(r.st.players[0].cash, 1700); assert.equal(r.st.phase, PHASE.BUY);
  r = run('c8', (st) => { st.players[0].pos = 7; });
  assert.equal(r.st.players[0].pos, 4); assert.equal(r.st.phase, PHASE.TAX);
  r = run('c5', (st) => { st.players[0].pos = 7; st.props[15].owner = 'p2'; });
  assert.equal(r.st.players[0].pos, 15); assert.equal(r.st.players[0].cash, 1450); assert.equal(r.st.players[1].cash, 1550);
  r = run('c4', (st) => { st.players[0].pos = 22; st.props[28].owner = 'p2'; });
  assert.equal(r.st.players[0].pos, 28);
  const dice = r.st.dice; assert.equal(r.st.players[1].cash - 1500, 10 * (dice[0] + dice[1]));
  r = run('c6'); assert.equal(r.st.players[0].cash, 1550);
  r = run('c11'); assert.equal(r.st.players[0].cash, 1485);
  r = run('c14'); assert.equal(r.st.players[0].cash, 1400); assert.equal(r.st.players[1].cash, 1550); assert.equal(r.st.players[2].cash, 1550);
  r = run('s7'); assert.equal(r.st.players[0].cash, 1520); assert.equal(r.st.players[1].cash, 1490);
  r = run('c7'); assert.deepEqual(r.st.players[0].jailCards, ['c7']);
  r = run('c9', (st) => { st.players[0].pos = 36; }); assert.equal(r.st.players[0].inJail, true); assert.equal(r.st.players[0].cash, 1500);
  r = run('c10', (st) => { st.props[1].owner = 'p1'; st.props[3].owner = 'p1'; st.props[1].houses = 5; st.props[3].houses = 2; });
  assert.equal(r.st.players[0].cash, 1500 - 100 - 50);
  r = run('s14', (st) => { st.props[1].owner = 'p1'; st.props[3].owner = 'p1'; st.props[1].houses = 1; st.props[3].houses = 1; });
  assert.equal(r.st.players[0].cash, 1420);
  r = run('c13', (st) => { st.players[0].pos = 36; }); assert.equal(r.st.players[0].pos, 39); assert.equal(r.st.phase, PHASE.BUY);
  r = run('c12', (st) => { st.players[0].pos = 36; }); assert.equal(r.st.players[0].pos, 5); assert.equal(r.st.players[0].cash, 1700);
});

test('Tax Evasion: 10% или фикс', () => {
  const st = game(2);
  giveProp(st, 39, 'p1'); st.props[39].houses = 2;
  st.players[0].pos = 4; st.phase = PHASE.TAX;
  assert.equal(netWorth(st, 'p1'), 1500 + 400 + 400);
  act(st, 'tax', 'p1', { mode: 'percent' });
  assert.equal(st.players[0].cash, 1500 - 230);
  const st2 = game(2);
  st2.players[0].pos = 4; st2.phase = PHASE.TAX;
  act(st2, 'tax', 'p1', { mode: 'flat' });
  assert.equal(st2.players[0].cash, 1300);
});

test('долг → залог → автооплата; банкротство → имущество кредитору; победа', () => {
  const st = game(2);
  giveProp(st, 39, 'p2'); giveProp(st, 37, 'p2'); st.props[39].houses = 5;
  giveProp(st, 1, 'p1'); giveProp(st, 5, 'p1');
  st.players[0].cash = 100; st.players[0].pos = 36;
  act(st, 'roll', 'p1', {}, diceRng([1, 2])); // 39 Beverly Hills с особняком: $2000
  assert.equal(st.phase, PHASE.DEBT);
  assert.equal(st.debt.amount, 2000);
  assert.ok(legalActions(st, 'p1').includes('bankrupt'));
  assert.ok(!legalActions(st, 'p1').includes('roll'));
  act(st, 'mortgage', 'p1', { idx: 5 });
  assert.equal(st.phase, PHASE.DEBT); // всё ещё не хватает
  act(st, 'bankrupt', 'p1');
  assert.equal(st.players[0].bankrupt, true);
  assert.equal(st.props[1].owner, 'p2');
  assert.equal(st.props[5].owner, 'p2');
  assert.equal(st.props[5].mortgaged, true);
  assert.equal(st.players[1].cash, 1500 + 100 + 100);
  assert.equal(st.phase, PHASE.OVER);
  assert.equal(st.winner, 'p2');
  // долг, который можно закрыть
  const st2 = game(2);
  giveProp(st2, 6, 'p2'); giveProp(st2, 8, 'p2'); giveProp(st2, 9, 'p2'); st2.props[6].houses = 3;
  giveProp(st2, 39, 'p1');
  st2.players[0].cash = 100;
  act(st2, 'roll', 'p1', {}, diceRng([2, 4]));
  assert.equal(st2.phase, PHASE.DEBT); assert.equal(st2.debt.amount, 270);
  assert.equal(liquidValue(st2, 'p1'), 300);
  assert.throws(() => act(st2, 'bankrupt', 'p1'), /ещё можете/);
  act(st2, 'mortgage', 'p1', { idx: 39 });
  assert.equal(st2.phase, PHASE.END);
  assert.equal(st2.players[0].cash, 100 + 200 - 270);
  assert.equal(st2.players[1].cash, 1770);
});

test('сделки', () => {
  const st = game(3);
  giveProp(st, 1, 'p1'); giveProp(st, 3, 'p2'); giveProp(st, 6, 'p2');
  assert.throws(() => act(st, 'trade_offer', 'p1', { to: 'p2', give: { cash: 5000 }, get: {} }), /наличных/);
  assert.throws(() => act(st, 'trade_offer', 'p1', { to: 'p2', give: { props: [3] }, get: {} }), /не владеет/);
  act(st, 'trade_offer', 'p1', { to: 'p2', give: { cash: 100, props: [1] }, get: { props: [3, 6] } });
  assert.ok(st.trade);
  assert.deepEqual(whoActs(st), ['p2']);
  assert.ok(!legalActions(st, 'p1').includes('roll'));
  assert.ok(legalActions(st, 'p2').includes('trade_accept'));
  act(st, 'trade_accept', 'p2');
  assert.equal(st.props[1].owner, 'p2'); assert.equal(st.props[3].owner, 'p1'); assert.equal(st.props[6].owner, 'p1');
  assert.equal(st.players[0].cash, 1400); assert.equal(st.players[1].cash, 1600);
  assert.equal(st.trade, null);
  act(st, 'trade_offer', 'p1', { to: 'p3', give: { cash: 10 }, get: {} });
  act(st, 'trade_reject', 'p3');
  assert.equal(st.trade, null);
  act(st, 'trade_offer', 'p1', { to: 'p3', give: { cash: 10 }, get: {} });
  act(st, 'trade_cancel', 'p1');
  assert.equal(st.trade, null);
  st.props[3].houses = 1;
  assert.throws(() => act(st, 'trade_offer', 'p1', { to: 'p3', give: { props: [3] }, get: {} }), /постройки/);
});

test('сдача и правило Free Parking', () => {
  const st = game(3, { freeParkingPool: true });
  st.players[0].pos = 4; st.phase = PHASE.TAX;
  act(st, 'tax', 'p1', { mode: 'flat' });
  assert.equal(st.pool, 200);
  act(st, 'end_turn', 'p1');
  st.players[1].pos = 15;
  act(st, 'roll', 'p2', {}, diceRng([2, 3]));
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
  giveProp(st, 1, 'p1'); giveProp(st, 3, 'p1'); st.props[1].houses = 2; st.props[3].mortgaged = true;
  assert.equal(liquidValue(st, 'p1'), 1500 + 30 + 50);
});
