// Обёртка над Telegram WebApp SDK. Всё работает и вне Telegram (обычный браузер).
export const tg = (typeof window !== 'undefined' && window.Telegram && window.Telegram.WebApp) || null;

export function inTelegram() { return !!(tg && tg.initData); }

export function initTelegram() {
  if (!tg) return;
  try { tg.ready(); } catch {}
  try { tg.expand(); } catch {}
  try { if (tg.isVersionAtLeast && tg.isVersionAtLeast('6.1')) { tg.setHeaderColor('secondary_bg_color'); tg.setBackgroundColor('secondary_bg_color'); } } catch {}
  try { if (tg.isVersionAtLeast && tg.isVersionAtLeast('7.7')) tg.disableVerticalSwipes(); } catch {}
  try { if (tg.isVersionAtLeast && tg.isVersionAtLeast('6.2')) tg.enableClosingConfirmation(); } catch {}
  applyTheme();
  try { tg.onEvent('themeChanged', applyTheme); } catch {}
}

export function applyTheme() {
  if (!tg) return;
  const root = document.documentElement;
  root.setAttribute('data-theme', tg.colorScheme === 'dark' ? 'dark' : 'light');
}

export function tgUser() {
  const u = tg && tg.initDataUnsafe && tg.initDataUnsafe.user;
  if (!u) return null;
  return { id: u.id, name: [u.first_name, u.last_name].filter(Boolean).join(' ').trim() || u.username || 'Игрок' };
}

export function startParam() {
  return (tg && tg.initDataUnsafe && tg.initDataUnsafe.start_param) || null;
}

export function haptic(kind = 'light') {
  if (!tg || !tg.HapticFeedback) return;
  try {
    if (['light', 'medium', 'heavy', 'rigid', 'soft'].includes(kind)) tg.HapticFeedback.impactOccurred(kind);
    else if (['error', 'success', 'warning'].includes(kind)) tg.HapticFeedback.notificationOccurred(kind);
    else tg.HapticFeedback.selectionChanged();
  } catch {}
}

let backHandler = null;
export function showBack(fn) {
  if (!tg || !tg.BackButton) return;
  try {
    if (backHandler) tg.BackButton.offClick(backHandler);
    backHandler = fn;
    tg.BackButton.onClick(fn);
    tg.BackButton.show();
  } catch {}
}
export function hideBack() {
  if (!tg || !tg.BackButton) return;
  try { if (backHandler) tg.BackButton.offClick(backHandler); backHandler = null; tg.BackButton.hide(); } catch {}
}

// Ссылка-приглашение в комнату: t.me/<bot>/<app>?startapp=<code>
export function inviteLink(code) {
  const cfg = (typeof window !== 'undefined' && window.PONOPOLY_CONFIG) || {};
  if (cfg.botName && cfg.appName) return `https://t.me/${cfg.botName}/${cfg.appName}?startapp=${code}`;
  if (typeof location !== 'undefined') { const u = new URL(location.href); u.searchParams.set('room', code); return u.toString(); }
  return code;
}

export function shareInvite(code) {
  const link = inviteLink(code);
  const text = `Залетай в Po'Nopoly, код комнаты ${code}`;
  if (tg && tg.openTelegramLink) {
    try { tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`); return true; } catch {}
  }
  if (typeof navigator !== 'undefined' && navigator.share) { navigator.share({ title: "Po'Nopoly", text, url: link }).catch(() => {}); return true; }
  return false;
}

export function cloudAvailable() {
  return !!(tg && tg.CloudStorage && tg.isVersionAtLeast && tg.isVersionAtLeast('6.9'));
}

export function cloudSet(key, value) {
  return new Promise((res, rej) => { try { tg.CloudStorage.setItem(key, value, (e, ok) => (e ? rej(e) : res(ok))); } catch (e) { rej(e); } });
}
export function cloudGet(key) {
  return new Promise((res, rej) => { try { tg.CloudStorage.getItem(key, (e, v) => (e ? rej(e) : res(v))); } catch (e) { rej(e); } });
}
export function cloudGetMany(keys) {
  return new Promise((res, rej) => { try { tg.CloudStorage.getItems(keys, (e, v) => (e ? rej(e) : res(v))); } catch (e) { rej(e); } });
}
export function cloudRemove(keys) {
  return new Promise((res, rej) => { try { tg.CloudStorage.removeItems(keys, (e, ok) => (e ? rej(e) : res(ok))); } catch (e) { rej(e); } });
}
