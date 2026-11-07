// Общий рейтинг: простой Эло-подобный счёт. Победитель получает 20 очков за каждого
// соперника, остальные теряют по 20 (не ниже 100). Хранится по имени игрока
// (локально — в настройках устройства, онлайн — на сервере в ratings.json).
export const RATING_START = 1000;

export function ratingKey(p) { return (p.uid ? `u${p.uid}` : `n:${String(p.name || '').trim().toLowerCase()}`); }

export function applyGameResult(stats, st, now = Date.now()) {
  const players = st.players;
  const n = players.length;
  for (const p of players) {
    const k = ratingKey(p);
    const s = stats[k] || { name: p.name, rating: RATING_START, games: 0, wins: 0, bot: !!p.bot };
    s.games += 1;
    if (p.id === st.winner) { s.wins += 1; s.rating += 20 * (n - 1); }
    else s.rating = Math.max(100, s.rating - 20);
    s.name = p.name; s.bot = !!p.bot; s.last = now;
    stats[k] = s;
  }
  return stats;
}

export function sortedRatings(stats) {
  return Object.entries(stats).map(([key, s]) => ({ key, ...s })).sort((a, b) => b.rating - a.rating || b.wins - a.wins || a.name.localeCompare(b.name));
}

// Текущая таблица партии: по общей стоимости имущества.
export function standings(st, netWorth) {
  return st.players.map((p) => ({ id: p.id, name: p.name, bot: p.bot, bankrupt: p.bankrupt, worth: p.bankrupt ? -1 : netWorth(st, p.id), cash: p.cash }))
    .sort((a, b) => b.worth - a.worth);
}
