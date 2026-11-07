// Сохранение локальной партии: Telegram CloudStorage (кусками по 4000 символов)
// с зеркалом в localStorage, либо только localStorage вне Telegram.
import { cloudAvailable, cloudSet, cloudGet, cloudGetMany, cloudRemove } from './telegram.js';

const KEY = 'ponopoly_save';
const CHUNK = 4000;

function ls() { try { return window.localStorage; } catch { return null; } }

function slimState(st) {
  const copy = { ...st, log: st.log.slice(-40) };
  return JSON.stringify(copy);
}

export async function saveGame(st) {
  const json = slimState(st);
  const store = ls();
  try { if (store) store.setItem(KEY, json); } catch {}
  if (!cloudAvailable()) return;
  try {
    const n = Math.ceil(json.length / CHUNK);
    for (let i = 0; i < n; i++) await cloudSet(`${KEY}_${i}`, json.slice(i * CHUNK, (i + 1) * CHUNK));
    await cloudSet(`${KEY}_n`, String(n));
  } catch (e) { console.warn('CloudStorage save failed', e); }
}

export async function loadGame() {
  if (cloudAvailable()) {
    try {
      const n = parseInt(await cloudGet(`${KEY}_n`), 10);
      if (n > 0) {
        const keys = Array.from({ length: n }, (_, i) => `${KEY}_${i}`);
        const parts = await cloudGetMany(keys);
        const json = keys.map((k) => parts[k] || '').join('');
        if (json) { const st = JSON.parse(json); if (st && st.v === 2) return st; }
      }
    } catch (e) { console.warn('CloudStorage load failed', e); }
  }
  const store = ls();
  try { const json = store && store.getItem(KEY); if (json) { const st = JSON.parse(json); return st && st.v === 2 ? st : null; } } catch {}
  return null;
}

export async function clearGame() {
  const store = ls();
  try { if (store) store.removeItem(KEY); } catch {}
  if (!cloudAvailable()) return;
  try {
    const n = parseInt(await cloudGet(`${KEY}_n`), 10) || 0;
    const keys = [`${KEY}_n`, ...Array.from({ length: n }, (_, i) => `${KEY}_${i}`)];
    await cloudRemove(keys);
  } catch {}
}

export function getPref(key, def = null) {
  const store = ls();
  try { const v = store && store.getItem(`ponopoly_${key}`); return v == null ? def : JSON.parse(v); } catch { return def; }
}
export function setPref(key, value) {
  const store = ls();
  try { if (store) store.setItem(`ponopoly_${key}`, JSON.stringify(value)); } catch {}
}
