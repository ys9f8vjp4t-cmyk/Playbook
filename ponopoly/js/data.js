// Po'Nopoly — board data, cards, tokens.
// Names on the board follow the prop seen in "Don't Be a Menace to South Central
// While Drinking Your Juice in the Hood" (1996): Watts, Roscoe's, Crenshaw, Oakland,
// Echo Park, Alvarado, Florence, Pawn Shop, Nail Salon, Tax Evasion, Robbed,
// Drive-By, No Chance, Community Service, Disconnect Notice. Squares not visible
// in the film are filled in with LA neighbourhoods in the same spirit.

export const GROUPS = {
  brown:     { name: 'Коричневые', color: '#8d5524', text: '#fff' },
  lightblue: { name: 'Голубые',    color: '#9fd3f3', text: '#0b2a3a' },
  pink:      { name: 'Розовые',    color: '#e4489a', text: '#fff' },
  orange:    { name: 'Оранжевые',  color: '#f39a2b', text: '#1b1200' },
  red:       { name: 'Красные',    color: '#e23b3b', text: '#fff' },
  yellow:    { name: 'Жёлтые',     color: '#f6e35b', text: '#2b2300' },
  green:     { name: 'Зелёные',    color: '#2fae62', text: '#fff' },
  darkblue:  { name: 'Синие',      color: '#1f5fbf', text: '#fff' },
  rail:      { name: 'Точки',      color: '#2b2b2b', text: '#fff' },
  util:      { name: 'Салоны',     color: '#8a8f99', text: '#fff' },
};

// Square types: go, prop, chest (Community Service), chance (No Chance), tax,
// rail (Pawn Shop & co.), util (Nail Salon / Barbershop), jail (County Hospital),
// parking, gotojail (Drive-By).
export const BOARD = [
  { i: 0,  type: 'go',       name: 'GO',            short: 'GO',        ru: 'Старт' },
  { i: 1,  type: 'prop',     name: 'Watts',         short: 'Watts',     group: 'brown', price: 60,  rent: [2, 10, 30, 90, 160, 250], house: 50 },
  { i: 2,  type: 'chest',    name: 'Community Service', short: 'Comm. Service', ru: 'Общественные работы' },
  { i: 3,  type: 'prop',     name: "Roscoe's Chicken & Waffles", short: "Roscoe's", group: 'brown', price: 60, rent: [4, 20, 60, 180, 320, 450], house: 50 },
  { i: 4,  type: 'tax',      name: 'Tax Evasion',   short: 'Tax Evasion', ru: 'Уклонение от налогов', amount: 200, percent: 10 },
  { i: 5,  type: 'rail',     name: 'Pawn Shop',     short: 'Pawn Shop', ru: 'Ломбард', price: 200 },
  { i: 6,  type: 'prop',     name: 'Crenshaw',      short: 'Cren\u00ADshaw',  group: 'lightblue', price: 100, rent: [6, 30, 90, 270, 400, 550], house: 50 },
  { i: 7,  type: 'chance',   name: 'No Chance',     short: 'No Chance', ru: 'Без шансов' },
  { i: 8,  type: 'prop',     name: 'Oakland',       short: 'Oakland',   group: 'lightblue', price: 100, rent: [6, 30, 90, 270, 400, 550], house: 50 },
  { i: 9,  type: 'prop',     name: 'Slauson',       short: 'Slauson',   group: 'lightblue', price: 120, rent: [8, 40, 100, 300, 450, 600], house: 50 },
  { i: 10, type: 'jail',     name: 'County Hospital', short: 'County Hospital', ru: 'Окружная больница' },
  { i: 11, type: 'prop',     name: 'Echo Park',     short: 'Echo Park', group: 'pink', price: 140, rent: [10, 50, 150, 450, 625, 750], house: 100 },
  { i: 12, type: 'util',     name: 'Nail Salon',    short: 'Nail Salon', ru: 'Маникюрный салон', price: 150 },
  { i: 13, type: 'prop',     name: 'Alvarado',      short: 'Alva\u00ADrado',  group: 'pink', price: 140, rent: [10, 50, 150, 450, 625, 750], house: 100 },
  { i: 14, type: 'prop',     name: 'Florence',      short: 'Flo\u00ADrence',  group: 'pink', price: 160, rent: [12, 60, 180, 500, 700, 900], house: 100 },
  { i: 15, type: 'rail',     name: 'Liquor Store',  short: 'Liquor Store', ru: 'Ликёрка', price: 200 },
  { i: 16, type: 'prop',     name: 'Normandie',     short: 'Norman\u00ADdie', group: 'orange', price: 180, rent: [14, 70, 200, 550, 750, 950], house: 100 },
  { i: 17, type: 'chest',    name: 'Community Service', short: 'Comm. Service', ru: 'Общественные работы' },
  { i: 18, type: 'prop',     name: 'Inglewood',     short: 'Ingle\u00ADwood', group: 'orange', price: 180, rent: [14, 70, 200, 550, 750, 950], house: 100 },
  { i: 19, type: 'prop',     name: 'Compton',       short: 'Comp\u00ADton',   group: 'orange', price: 200, rent: [16, 80, 220, 600, 800, 1000], house: 100 },
  { i: 20, type: 'parking',  name: 'Free Parking',  short: 'Free Parking', ru: 'Бесплатная парковка' },
  { i: 21, type: 'prop',     name: 'Koreatown',     short: 'Korea\u00ADtown', group: 'red', price: 220, rent: [18, 90, 250, 700, 875, 1050], house: 150 },
  { i: 22, type: 'chance',   name: 'No Chance',     short: 'No Chance', ru: 'Без шансов' },
  { i: 23, type: 'prop',     name: 'Hollywood',     short: 'Holly\u00ADwood', group: 'red', price: 220, rent: [18, 90, 250, 700, 875, 1050], house: 150 },
  { i: 24, type: 'prop',     name: 'Silver Lake',   short: 'Silver Lake', group: 'red', price: 240, rent: [20, 100, 300, 750, 925, 1100], house: 150 },
  { i: 25, type: 'rail',     name: 'Swap Meet',     short: 'Swap Meet', ru: 'Барахолка', price: 200 },
  { i: 26, type: 'prop',     name: 'Venice Beach',  short: 'Venice',    group: 'yellow', price: 260, rent: [22, 110, 330, 800, 975, 1150], house: 150 },
  { i: 27, type: 'prop',     name: 'Santa Monica',  short: 'Santa Monica', group: 'yellow', price: 260, rent: [22, 110, 330, 800, 975, 1150], house: 150 },
  { i: 28, type: 'util',     name: 'Barbershop',    short: 'Barber\u00ADshop', ru: 'Барбершоп', price: 150 },
  { i: 29, type: 'prop',     name: 'Malibu',        short: 'Malibu',    group: 'yellow', price: 280, rent: [24, 120, 360, 850, 1025, 1200], house: 150 },
  { i: 30, type: 'gotojail', name: 'Drive-By',      short: 'Drive-By',  ru: 'Пролётка' },
  { i: 31, type: 'prop',     name: 'Culver City',   short: 'Culver City', group: 'green', price: 300, rent: [26, 130, 390, 900, 1100, 1275], house: 200 },
  { i: 32, type: 'prop',     name: 'Westwood',      short: 'West\u00ADwood',  group: 'green', price: 300, rent: [26, 130, 390, 900, 1100, 1275], house: 200 },
  { i: 33, type: 'chest',    name: 'Community Service', short: 'Comm. Service', ru: 'Общественные работы' },
  { i: 34, type: 'prop',     name: 'Brentwood',     short: 'Brent\u00ADwood', group: 'green', price: 320, rent: [28, 150, 450, 1000, 1200, 1400], house: 200 },
  { i: 35, type: 'rail',     name: 'Check Cashing', short: 'Check Cash\u00ADing', ru: 'Обнал чеков', price: 200 },
  { i: 36, type: 'chance',   name: 'No Chance',     short: 'No Chance', ru: 'Без шансов' },
  { i: 37, type: 'prop',     name: 'Baldwin Hills', short: 'Baldwin Hills', group: 'darkblue', price: 350, rent: [35, 175, 500, 1100, 1300, 1500], house: 200 },
  { i: 38, type: 'tax',      name: 'Robbed',        short: 'Robbed',    ru: 'Ограбили', amount: 100 },
  { i: 39, type: 'prop',     name: 'Beverly Hills', short: 'Beverly Hills', group: 'darkblue', price: 400, rent: [50, 200, 600, 1400, 1700, 2000], house: 200 },
];

export const GO_SALARY = 200;
export const JAIL_FINE = 50;
export const JAIL_POS = 10;
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

// "No Chance" deck. fx kinds: go, move(to), util, rail, cash(a), jailcard, back(n),
// jail, repairs(h, m), each(a)  — positive "each" = collect from every player.
export const CHANCE = [
  { id: 'c1',  text: 'Беги на СТАРТ. Пособие пришло — получи $200.', fx: { k: 'go' } },
  { id: 'c2',  text: 'Езжай в Compton. Если проходишь СТАРТ — получи $200.', fx: { k: 'move', to: 19 } },
  { id: 'c3',  text: 'Езжай в Echo Park. Если проходишь СТАРТ — получи $200.', fx: { k: 'move', to: 11 } },
  { id: 'c4',  text: 'Езжай в ближайший салон (Nail Salon или Barbershop). Если он занят — брось кубики и заплати хозяину в 10 раз больше выпавшего.', fx: { k: 'util' } },
  { id: 'c5',  text: 'Езжай в ближайшую точку (Pawn Shop, Liquor Store, Swap Meet или Check Cashing). Если она занята — плати двойную аренду.', fx: { k: 'rail' } },
  { id: 'c6',  text: 'Дядя наконец вернул долг. Получи $50.', fx: { k: 'cash', a: 50 } },
  { id: 'c7',  text: 'Выписка из County Hospital — бесплатно. Держи карту, пока не понадобится.', fx: { k: 'jailcard' } },
  { id: 'c8',  text: 'Копы развернули на блокпосту. Вернись на 3 клетки назад.', fx: { k: 'back', n: 3 } },
  { id: 'c9',  text: 'Поймал шальную. Прямиком в County Hospital. СТАРТ не проходишь, $200 не получаешь.', fx: { k: 'jail' } },
  { id: 'c10', text: 'Облава на районе. Плати $25 за каждую хату и $100 за каждый особняк.', fx: { k: 'repairs', h: 25, m: 100 } },
  { id: 'c11', text: 'Штраф за музыку из лоурайдера. Плати $15.', fx: { k: 'cash', a: -15 } },
  { id: 'c12', text: 'Прокатись до Pawn Shop. Если проходишь СТАРТ — получи $200.', fx: { k: 'move', to: 5 } },
  { id: 'c13', text: 'Езжай в Beverly Hills. Посмотри, как живут люди.', fx: { k: 'move', to: 39 } },
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

export const TOKENS = [
  { id: 'lowrider', emoji: '🚗', name: 'Лоурайдер' },
  { id: 'pager',    emoji: '📟', name: 'Пейджер' },
  { id: 'boombox',  emoji: '📻', name: 'Бумбокс' },
  { id: 'sneaker',  emoji: '👟', name: 'Кроссовок' },
  { id: 'chicken',  emoji: '🍗', name: 'Курица' },
  { id: 'chain',    emoji: '⛓️', name: 'Цепь' },
  { id: 'cap',      emoji: '🧢', name: 'Кепка' },
  { id: 'bottle',   emoji: '🍾', name: 'Бутылка' },
];

export const PLAYER_COLORS = ['#e53935', '#1e88e5', '#43a047', '#fdd835', '#8e24aa', '#fb8c00'];

export const BOT_NAMES = ['Ashtray', 'Loc Dog', 'Preach', 'Crazy Legs', 'Dashiki', 'Toothpick', 'Doo Rag', 'Old Dog'];

export const DEFAULT_SETTINGS = {
  startCash: 1500,
  auctions: true,          // аукцион, если игрок отказался покупать
  freeParkingPool: false,  // штрафы и налоги копятся на Free Parking
  maxPlayers: 6,
};
