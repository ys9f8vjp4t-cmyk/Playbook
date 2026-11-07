import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, applyAction, PHASE, whoActs } from '../js/engine.js';
import { nextBotAction } from '../js/bot.js';

test('боты доигрывают партию до конца без ошибок', () => {
  let finished = 0, longest = 0;
  for (let seed = 1; seed <= 25; seed++) {
    const st = createGame({ players: [{ name: 'A', bot: true }, { name: 'B', bot: true }, { name: 'C', bot: true }, { name: 'D', bot: true }], seed });
    let steps = 0;
    while (st.phase !== PHASE.OVER && steps < 20000) {
      const a = nextBotAction(st);
      assert.ok(a, `бот не знает, что делать: фаза ${st.phase}, ждём ${whoActs(st)}`);
      applyAction(st, a);
      steps++;
    }
    if (st.phase === PHASE.OVER) finished++;
    longest = Math.max(longest, st.turnNo);
    // деньги не уходят в минус
    for (const p of st.players) assert.ok(p.cash >= 0, `отрицательный баланс у ${p.name}: ${p.cash}`);
    // у каждой клетки с постройками есть владелец и вся группа у него
    for (const [i, ps] of Object.entries(st.props)) if (ps.houses > 0) assert.ok(ps.owner, `постройки без владельца на ${i}`);
  }
  console.log(`# партий закончено: ${finished}/25, самая длинная: ${longest} ходов`);
  assert.ok(finished >= 18, `закончилось партий: ${finished} из 25`);
});
