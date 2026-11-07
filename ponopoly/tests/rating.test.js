import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyGameResult, sortedRatings, standings, RATING_START } from '../js/rating.js';
import { createGame, netWorth } from '../js/engine.js';

test('рейтинг: победитель получает 20 за соперника, остальные теряют 20', () => {
  const st = createGame({ players: [{ name: 'Вася' }, { name: 'Лок Дог', bot: true }, { name: 'Пепельница', bot: true }], seed: 1 });
  st.winner = 'p1';
  const stats = applyGameResult({}, st, 123);
  const rows = sortedRatings(stats);
  assert.equal(rows[0].name, 'Вася');
  assert.equal(rows[0].rating, RATING_START + 40);
  assert.equal(rows[0].wins, 1);
  assert.equal(rows[1].rating, RATING_START - 20);
  assert.equal(rows[1].bot, true);
  // вторая партия, тот же игрок проигрывает
  st.winner = 'p2';
  applyGameResult(stats, st, 124);
  assert.equal(stats['n:вася'].rating, RATING_START + 20);
  assert.equal(stats['n:вася'].games, 2);
  // не ниже 100
  const low = { 'n:x': { name: 'x', rating: 110, games: 0, wins: 0 } };
  const g = createGame({ players: [{ name: 'x' }, { name: 'y' }], seed: 2 }); g.winner = 'p2';
  applyGameResult(low, g);
  assert.equal(low['n:x'].rating, 100);
});

test('таблица партии по стоимости имущества', () => {
  const st = createGame({ players: [{ name: 'A' }, { name: 'B' }], seed: 3 });
  st.players[1].cash = 2000;
  const rows = standings(st, netWorth);
  assert.equal(rows[0].name, 'B');
  assert.equal(rows[0].worth, 2000);
});
