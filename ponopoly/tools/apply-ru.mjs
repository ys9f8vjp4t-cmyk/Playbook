// Генерирует js/ru.js из JSON-набора русификации (результат переводческого workflow или ручной правки).
// Использование: node tools/apply-ru.mjs tools/ru-set.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = process.argv[2];
if (!src) { console.error('нужен путь к JSON'); process.exit(1); }
const set = JSON.parse(fs.readFileSync(src, 'utf8'));
const problems = [];
const latin = /[A-Za-z]/;
const check = (where, s) => { if (typeof s !== 'string' || !s.trim()) problems.push(`${where}: пусто`); else if (latin.test(s)) problems.push(`${where}: латиница в «${s}»`); };

check('logo', set.logo); check('logoSub', set.logoSub);
const TERMS = ['hospital', 'hospitalShort', 'hospitalIn', 'hospitalFrom', 'visiting', 'parking', 'parkingShort', 'go', 'chance', 'chanceShort', 'chest', 'chestShort', 'dn', 'dnStamp', 'dnUnder', 'tax', 'taxShort', 'robbed', 'robbedShort', 'driveby', 'drivebyShort', 'drivebyEvent', 'og'];
for (const k of TERMS) check(`terms.${k}`, set.terms && set.terms[k]);
const squares = {};
for (const s of set.squares || []) { squares[s.i] = { ru: s.ru, ruShort: s.ruShort }; check(`square ${s.i}.ru`, s.ru); check(`square ${s.i}.ruShort`, s.ruShort); const lim = [0, 10, 20, 30].includes(s.i) ? 20 : 16; if ((s.ruShort || '').replace(/\|/g, '').length > lim) problems.push(`square ${s.i}: ruShort длиннее ${lim}: «${s.ruShort}»`); }
for (let i = 0; i < 40; i++) if (!squares[i]) problems.push(`нет клетки ${i}`);
if (!Array.isArray(set.bots) || set.bots.length !== 8) problems.push('ботов должно быть 8');
(set.bots || []).forEach((b, i) => check(`bot ${i}`, b));
const cards = {};
for (const c of set.cards || []) { cards[c.id] = c.ru; check(`card ${c.id}`, c.ru); }
for (const id of [...Array.from({ length: 16 }, (_, i) => `c${i + 1}`), ...Array.from({ length: 16 }, (_, i) => `s${i + 1}`)]) if (!cards[id]) problems.push(`нет карточки ${id}`);
// суммы в карточках должны совпадать с исходными
const dataSrc = fs.readFileSync(path.join(ROOT, 'js', 'data.js'), 'utf8');
for (const m of dataSrc.matchAll(/id: '([cs]\d+)',\s+text: '((?:[^'\\]|\\.)*)'/g)) {
  const [, id, text] = m;
  const nums = (t) => (t.match(/\$\d+|\d+ клет|\d+ раз/g) || []).join(',');
  if (cards[id] && nums(text) !== nums(cards[id])) problems.push(`card ${id}: суммы отличаются (${nums(text)} vs ${nums(cards[id])})`);
}
if (problems.length) { console.error('Проблемы в наборе:\n - ' + problems.join('\n - ')); process.exit(2); }

const out = `// Полная русификация доски. Сгенерировано tools/apply-ru.mjs — правьте JSON-набор, не этот файл.
// Символ «|» в ruShort — место мягкого переноса (превращается в U+00AD при показе).
export const RU = ${JSON.stringify({ logo: set.logo, logoSub: set.logoSub, terms: Object.fromEntries(TERMS.map((k) => [k, set.terms[k]])), squares, bots: set.bots, cards }, null, 2)};
`;
fs.writeFileSync(path.join(ROOT, 'js', 'ru.js'), out);
console.log('js/ru.js записан:', set.logo, '/', Object.keys(squares).length, 'клеток,', Object.keys(cards).length, 'карточек');
