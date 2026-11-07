// Po'Nopoly — board data, cards, tokens, localisation helpers.
// The board follows the prop seen in the unrated cut of "Don't Be a Menace to South
// Central While Drinking Your Juice in the Hood" (1996): 11 squares per side, 48 in all.
// Squares marked `seen: true` are read directly from frames of the film (names, colour
// bands, order along one side). The rest are reconstructed in the same spirit; see
// README («Доска из фильма») for what is confirmed and what is a guess.
import { RU } from './ru.js';

export const GROUPS = {
  purple:    { name: 'Фиолетовые', color: '#8f3fa6', text: '#fff' },
  lightblue: { name: 'Голубые',    color: '#9fd3f3', text: '#0b2a3a' },
  darkblue:  { name: 'Синие',      color: '#2436b8', text: '#fff' },
  pink:      { name: 'Розовые',    color: '#e4489a', text: '#fff' },
  orange:    { name: 'Оранжевые',  color: '#f39a2b', text: '#1b1200' },
  red:       { name: 'Красные',    color: '#e23b3b', text: '#fff' },
  yellow:    { name: 'Жёлтые',     color: '#f6e35b', text: '#2b2300' },
  green:     { name: 'Зелёные',    color: '#2fae62', text: '#fff' },
  navy:      { name: 'Тёмно-синие', color: '#0b2a6b', text: '#fff' },
  rail:      { name: 'Точки',      color: '#2b2b2b', text: '#fff' },
  util:      { name: 'Салоны',     color: '#8a8f99', text: '#fff' },
};

// Square types: go, prop, chest (Community Service), chance (No Chance), tax (Tax Evasion,
// Robbed), rail (Pawn Shop & co.), util (Nail Salon / Barbershop), jail (County Hospital),
// parking, driveby (skip a turn), gotojail (Car Jacking → County Hospital).
const P = (i, name, short, group, price, rent, house, extra = {}) => ({ i, type: 'prop', name, short, group, price, rent, house, ...extra });
export const BOARD = [
  // ---- side 1 (read from the film, in this order) ----
  { i: 0,  type: 'go',       name: 'GO',              short: 'GO',               ru: 'Старт', seen: true },
  P(1, 'Westchester', 'West­chester', 'lightblue', 100, [6, 30, 90, 270, 400, 550], 50, { seen: true }),
  { i: 2,  type: 'chance',   name: 'No Chance',       short: 'No Chance',        seen: true },
  P(3, 'Oakland', 'Oakland', 'lightblue', 120, [8, 40, 100, 300, 450, 600], 50, { seen: true }),
  { i: 4,  type: 'tax',      name: 'Robbed',          short: 'Robbed',           amount: 100, seen: true },
  { i: 5,  type: 'tax',      name: 'Tax Evasion',     short: 'Tax Evasion',      amount: 200, percent: 10, seen: true, sub: 'PAY 10% OR $200' },
  P(6, 'Echo Park', 'Echo Park', 'darkblue', 140, [10, 50, 150, 450, 625, 750], 100, { seen: true }),
  { i: 7,  type: 'chest',    name: 'Community Service', short: 'Community Service', seen: true },
  P(8, 'Alvarado', 'Alva­rado', 'darkblue', 140, [10, 50, 150, 450, 625, 750], 100, { seen: true }),
  P(9, 'Florence', 'Flo­rence', 'darkblue', 160, [12, 60, 180, 500, 700, 900], 100, { seen: true }),
  { i: 10, type: 'rail',     name: 'Pawn Shop',       short: 'Pawn Shop',        price: 200, seen: true },
  P(11, 'Normandie', 'Norman­die', 'darkblue', 160, [12, 60, 180, 500, 700, 900], 100, { seen: true }),
  { i: 12, type: 'jail',     name: 'County Hospital', short: 'County Hospital',  seen: true },
  // ---- side 2 (reconstructed) ----
  P(13, 'Crenshaw', 'Cren­shaw', 'pink', 180, [14, 70, 200, 550, 750, 950], 100),
  { i: 14, type: 'util',     name: 'Nail Salon',      short: 'Nail Salon',       price: 150 },
  P(15, 'Slauson', 'Slauson', 'pink', 180, [14, 70, 200, 550, 750, 950], 100),
  P(16, 'Inglewood', 'Ingle­wood', 'pink', 200, [16, 80, 220, 600, 800, 1000], 100),
  { i: 17, type: 'rail',     name: 'Liquor Store',    short: 'Liquor Store',     price: 200 },
  P(18, 'Compton', 'Comp­ton', 'orange', 220, [18, 90, 250, 700, 875, 1050], 150),
  { i: 19, type: 'chance',   name: 'No Chance',       short: 'No Chance' },
  P(20, 'Figueroa', 'Figue­roa', 'orange', 220, [18, 90, 250, 700, 875, 1050], 150),
  P(21, 'Hoover', 'Hoover', 'orange', 240, [20, 100, 300, 750, 925, 1100], 150),
  { i: 22, type: 'chest',    name: 'Community Service', short: 'Community Service' },
  P(23, 'Lynwood', 'Lyn­wood', 'orange', 240, [20, 100, 300, 750, 925, 1100], 150),
  { i: 24, type: 'parking',  name: 'Free Parking',    short: 'Free Parking' },
  // ---- side 3 (reconstructed) ----
  P(25, 'Koreatown', 'Korea­town', 'red', 260, [22, 110, 330, 800, 975, 1150], 150),
  { i: 26, type: 'chance',   name: 'No Chance',       short: 'No Chance' },
  P(27, 'Hollywood', 'Holly­wood', 'red', 260, [22, 110, 330, 800, 975, 1150], 150),
  P(28, 'Silver Lake', 'Silver Lake', 'red', 280, [24, 120, 360, 850, 1025, 1200], 150),
  { i: 29, type: 'rail',     name: 'Swap Meet',       short: 'Swap Meet',        price: 200 },
  P(30, 'Venice Beach', 'Venice Beach', 'yellow', 300, [26, 130, 390, 900, 1100, 1275], 200),
  P(31, 'Santa Monica', 'Santa Monica', 'yellow', 300, [26, 130, 390, 900, 1100, 1275], 200),
  { i: 32, type: 'util',     name: 'Barbershop',      short: 'Barber­shop', price: 150 },
  P(33, 'Malibu', 'Malibu', 'yellow', 320, [28, 150, 450, 1000, 1200, 1400], 200),
  { i: 34, type: 'chest',    name: 'Community Service', short: 'Community Service' },
  P(35, 'Long Beach', 'Long Beach', 'yellow', 320, [28, 150, 450, 1000, 1200, 1400], 200),
  { i: 36, type: 'gotojail', name: 'Car Jacking',     short: 'Car Jacking',      seen: true },
  // ---- side 4 (Drive-By, Roscoe's and Watts are read from the film) ----
  P(37, 'Culver City', 'Culver City', 'green', 350, [35, 175, 500, 1100, 1300, 1500], 200),
  P(38, 'Westwood', 'West­wood', 'green', 350, [35, 175, 500, 1100, 1300, 1500], 200),
  { i: 39, type: 'chest',    name: 'Community Service', short: 'Community Service' },
  P(40, 'Brentwood', 'Brent­wood', 'green', 375, [40, 190, 550, 1200, 1400, 1600], 200),
  { i: 41, type: 'rail',     name: 'Check Cashing',   short: 'Check Cash­ing', price: 200 },
  { i: 42, type: 'chance',   name: 'No Chance',       short: 'No Chance' },
  P(43, 'Baldwin Hills', 'Baldwin Hills', 'navy', 400, [50, 200, 600, 1400, 1700, 2000], 250),
  P(44, 'Beverly Hills', 'Beverly Hills', 'navy', 450, [60, 240, 700, 1500, 1850, 2200], 250),
  { i: 45, type: 'driveby',  name: 'Drive-By',        short: 'Drive-By',         seen: true },
  P(46, "Roscoe's Chicken & Waffles", "Roscoe's", 'purple', 60, [4, 20, 60, 180, 320, 450], 50, { seen: true }),
  P(47, 'Watts', 'Watts', 'purple', 60, [2, 10, 30, 90, 160, 250], 50, { seen: true }),
];

export const N = BOARD.length;           // 48
export const SIDE = N / 4;               // 12 (corner + 11)
export const GO_SALARY = 200;
export const JAIL_FINE = 50;
export const JAIL_POS = BOARD.find((s) => s.type === 'jail').i; // 12
export const RAIL_RENT = [25, 50, 100, 200];
export const MAX_HOUSES = 5; // 5 = особняк (hotel)

export const OWNABLE = new Set(['prop', 'rail', 'util']);

export function isOwnable(sq) { return OWNABLE.has(sq.type); }

export function groupMembers(group) {
  return BOARD.filter((s) => (s.type === 'prop' && s.group === group) || (s.type === 'rail' && group === 'rail') || (s.type === 'util' && group === 'util')).map((s) => s.i);
}

export function groupOf(sq) {
  if (sq.type === 'prop') return sq.group;
  if (sq.type === 'rail') return 'rail';
  if (sq.type === 'util') return 'util';
  return null;
}

export const PROP_GROUPS = Object.keys(GROUPS).filter((g) => g !== 'rail' && g !== 'util');
export const idxOf = (name) => { const s = BOARD.find((x) => x.name === name); if (!s) throw new Error('no square ' + name); return s.i; };

// "No Chance" deck. fx kinds: go, move(to), util, rail, cash(a), jailcard, back(n),
// jail, repairs(h, m), each(a)  — positive "each" = collect from every player.
export const CHANCE = [
  { id: 'c1',  text: 'Беги на СТАРТ. Пособие пришло — получи $200.', fx: { k: 'go' } },
  { id: 'c2',  text: 'Езжай в Compton. Если проходишь СТАРТ — получи $200.', fx: { k: 'move', to: 18 } },
  { id: 'c3',  text: 'Езжай в Echo Park. Если проходишь СТАРТ — получи $200.', fx: { k: 'move', to: 6 } },
  { id: 'c4',  text: 'Езжай в ближайший салон (Nail Salon или Barbershop). Если он занят — брось кубики и заплати хозяину в 10 раз больше выпавшего.', fx: { k: 'util' } },
  { id: 'c5',  text: 'Езжай в ближайшую точку (Pawn Shop, Liquor Store, Swap Meet или Check Cashing). Если она занята — плати двойную аренду.', fx: { k: 'rail' } },
  { id: 'c6',  text: 'Дядя наконец вернул долг. Получи $50.', fx: { k: 'cash', a: 50 } },
  { id: 'c7',  text: 'Выписка из County Hospital — бесплатно. Держи карту, пока не понадобится.', fx: { k: 'jailcard' } },
  { id: 'c8',  text: 'Копы развернули на блокпосту. Вернись на 3 клетки назад.', fx: { k: 'back', n: 3 } },
  { id: 'c9',  text: 'Поймал шальную. Прямиком в County Hospital. СТАРТ не проходишь, $200 не получаешь.', fx: { k: 'jail' } },
  { id: 'c10', text: 'Облава на районе. Плати $25 за каждую хату и $100 за каждый особняк.', fx: { k: 'repairs', h: 25, m: 100 } },
  { id: 'c11', text: 'Штраф за музыку из лоурайдера. Плати $15.', fx: { k: 'cash', a: -15 } },
  { id: 'c12', text: 'Прокатись до Pawn Shop. Если проходишь СТАРТ — получи $200.', fx: { k: 'move', to: 10 } },
  { id: 'c13', text: 'Езжай в Beverly Hills. Посмотри, как живут люди.', fx: { k: 'move', to: 44 } },
  { id: 'c14', text: 'Тебя выбрали OG района. Проставься: каждому игроку по $50.', fx: { k: 'each', a: -50 } },
  { id: 'c15', text: 'Страховая наконец выплатила за старую тачку. Получи $150.', fx: { k: 'cash', a: 150 } },
  { id: 'c16', text: 'Выиграл баттл на районе. Получи $100.', fx: { k: 'cash', a: 100 } },
];

// "Community Service" deck.
export const CHEST = [
  { id: 's1',  text: 'Отработал исправительные часы. Беги на СТАРТ, получи $200.', fx: { k: 'go' } },
  { id: 's2',  text: 'Банкомат выдал лишнее. Получи $200.', fx: { k: 'cash', a: 200 } },
  { id: 's3',  text: 'Приём у врача в County Hospital. Плати $50.', fx: { k: 'cash', a: -50 } },
  { id: 's4',  text: 'Продал кроссы на Swap Meet. Получи $50.', fx: { k: 'cash', a: 50 } },
  { id: 's5',  text: 'Досрочная выписка из County Hospital. Держи карту, пока не понадобится.', fx: { k: 'jailcard' } },
  { id: 's6',  text: 'Подрался на вечеринке. Прямиком в County Hospital. СТАРТ не проходишь.', fx: { k: 'jail' } },
  { id: 's7',  text: 'День рождения! Каждый игрок скидывается по $10.', fx: { k: 'each', a: 10 } },
  { id: 's8',  text: 'Тётушка прислала перевод. Получи $100.', fx: { k: 'cash', a: 100 } },
  { id: 's9',  text: 'Возврат налогов. Получи $20.', fx: { k: 'cash', a: 20 } },
  { id: 's10', text: 'Нашёл заначку в старом кроссовке. Получи $100.', fx: { k: 'cash', a: 100 } },
  { id: 's11', text: 'Счёт из County Hospital. Плати $100.', fx: { k: 'cash', a: -100 } },
  { id: 's12', text: 'Кузен просит внести залог. Плати $50.', fx: { k: 'cash', a: -50 } },
  { id: 's13', text: 'Починил соседу магнитолу. Получи $25.', fx: { k: 'cash', a: 25 } },
  { id: 's14', text: 'Субботник на районе. Плати $40 за каждую хату и $115 за каждый особняк.', fx: { k: 'repairs', h: 40, m: 115 } },
  { id: 's15', text: 'Второе место на выставке лоурайдеров. Получи $10.', fx: { k: 'cash', a: 10 } },
  { id: 's16', text: 'Наследство от бабули. Получи $100.', fx: { k: 'cash', a: 100 } },
];

export const CARD_BY_ID = Object.fromEntries([...CHANCE, ...CHEST].map((c) => [c.id, c]));

// Gold-coloured tokens like the ones on the prop (a lowrider, a pager, a bullet casing…).
export const TOKENS = [
  { id: 'gangsta',   emoji: '🕶️', name: 'Гангста',   desc: 'Южный Централ: бандана, белая футболка, цепь' },
  { id: 'professor', emoji: '🧪', name: 'Профессор', desc: 'Халат, бабочка, колба' },
  { id: 'gopnik',    emoji: '🧢', name: 'Гопник',    desc: 'Спортивный костюм, кепка, минералка' },
  { id: 'vatnik',    emoji: '🧥', name: 'Ватник',    desc: 'Телогрейка, ушанка, валенки' },
  { id: 'cholo',     emoji: '🪢', name: 'Чоло',      desc: 'Восточный ЛА: фланель, бандана, лоурайдер-культура' },
  { id: 'pachuco',   emoji: '🎩', name: 'Пачуко',    desc: 'Восточный ЛА 1940-х: зут-костюм, шляпа с пером, цепочка' },
  { id: 'roadman',   emoji: '🧣', name: 'Роудмен',   desc: 'Лондон: пуховик, кепка, сумка через грудь' },
  { id: 'cockney',   emoji: '🎩', name: 'Кокни',     desc: 'Лондон 1920-х: твидовая кепка, тройка, трость' },
];

export const PLAYER_COLORS = ['#e53935', '#1e88e5', '#43a047', '#fdd835', '#8e24aa', '#fb8c00'];

export const BOT_NAMES = ['Ashtray', 'Loc Dog', 'Preach', 'Crazy Legs', 'Dashiki', 'Toothpick', 'Doo Rag', 'Old Dog'];

export const DEFAULT_SETTINGS = {
  lang: 'en',             // 'en' — названия как на доске из фильма, 'ru' — полная русификация
  startCash: 1500,
  auctions: true,          // аукцион, если игрок отказался покупать
  freeParkingPool: false,  // штрафы и налоги копятся на Free Parking
  maxPlayers: 6,
};

// ---------- localisation ----------
// Термины в режиме «как в фильме» (интерфейс русский, названия — с реквизита).
export const TERMS_EN = {
  hospital: 'County Hospital', hospitalShort: 'County Hospital', hospitalIn: 'в County Hospital', hospitalFrom: 'из County Hospital', hospitalAt: 'в County Hospital',
  visiting: 'навещает кореша в County Hospital', parking: 'Free Parking', parkingShort: 'Free Parking', go: 'GO',
  chance: 'NO CHANCE', chanceShort: 'No Chance', chest: 'COMMUNITY SERVICE', chestShort: 'Community Service',
  dn: 'Disconnect Notice', dnStamp: 'DISCONNECT NOTICE', dnUnder: 'под Disconnect Notice',
  tax: 'Tax Evasion', taxShort: 'Tax Evasion', robbed: 'Robbed', robbedShort: 'Robbed',
  driveby: 'Drive-By', drivebyShort: 'Drive-By', drivebyEvent: 'попал под Drive-By и пропускает следующий ход',
  carjack: 'Car Jacking', carjackEvent: 'угнали тачку — Car Jacking', og: 'OG района',
  logo: "PO'NOPOLY", logoSub: 'by Darker Brothers',
};
export const LANGS = ['en', 'ru'];
export function langOf(st) { return st && st.settings && st.settings.lang === 'ru' ? 'ru' : 'en'; }
export function term(st, key) {
  const lang = typeof st === 'string' ? st : langOf(st);
  if (lang === 'ru') { if (key === 'logo') return RU.logo; if (key === 'logoSub') return RU.logoSub; return RU.terms[key] || TERMS_EN[key]; }
  return TERMS_EN[key];
}
export function sqName(st, idx) { return (typeof st === 'string' ? st : langOf(st)) === 'ru' ? RU.squares[idx].ru : BOARD[idx].name; }
export function sqShort(st, idx) {
  const lang = typeof st === 'string' ? st : langOf(st);
  return lang === 'ru' ? RU.squares[idx].ruShort.replace(/\|/g, '­') : BOARD[idx].short;
}
// Название клетки для текста журнала: по-русски — в кавычках, чтобы не спотыкаться о падежи.
export function sqRef(st, idx) { return langOf(st) === 'ru' ? `«${sqName(st, idx)}»` : sqName(st, idx); }
export function cardText(st, card) { return langOf(st) === 'ru' && RU.cards[card.id] ? RU.cards[card.id] : card.text; }
export function botNames(lang) { return lang === 'ru' ? RU.bots : BOT_NAMES; }
export function deckName(st, deck) { return term(st, deck === 'chance' ? 'chance' : 'chest'); }
