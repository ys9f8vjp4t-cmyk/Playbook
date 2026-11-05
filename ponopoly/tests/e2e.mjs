// Сквозной тест в браузере: локальная игра с ботами и онлайн-комната на двух вкладках.
// Запуск: node tests/e2e.mjs  (нужен playwright + chromium)
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 18200 + Math.floor(Math.random() * 200);
const OUT = process.env.E2E_OUT || path.join(ROOT, 'tests', 'shots');
fs.mkdirSync(OUT, { recursive: true });
const shot = async (page, name) => { await page.waitForTimeout(350); await page.screenshot({ path: path.join(OUT, name + '.png') }); };
const log = (...a) => console.log('[e2e]', ...a);

function startServer() {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), BOT_SPEED: '0.2' } });
    proc.stdout.on('data', (d) => { if (String(d).includes('server on')) resolve(proc); });
    proc.stderr.on('data', (d) => console.error(String(d)));
    setTimeout(() => reject(new Error('server start timeout')), 8000);
  });
}

async function waitFor(page, fn, ms = 15000, every = 100) {
  const t0 = Date.now();
  for (;;) {
    const v = await page.evaluate(fn);
    if (v) return v;
    if (Date.now() - t0 > ms) throw new Error('waitFor timeout');
    await page.waitForTimeout(every);
  }
}

const errors = [];
function watch(page, tag) {
  page.on('pageerror', (e) => { errors.push(`${tag}: ${e.message}`); console.error('PAGEERROR', tag, e.message); });
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|fonts|telegram-web-app|net::ERR|Failed to load resource/.test(m.text())) { errors.push(`${tag}: ${m.text()}`); console.error('CONSOLE', tag, m.text()); } });
}

const proc = await startServer();
const browser = await chromium.launch();
try {
  const base = `http://localhost:${PORT}/`;
  // ---------- локальная игра ----------
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'ru-RU' });
  const page = await ctx.newPage(); watch(page, 'local');
  await page.goto(base);
  await page.waitForSelector('#screen-menu.active');
  await shot(page, '01-menu');
  await page.click('#btn-new');
  await page.waitForSelector('#screen-setup.active');
  await page.fill('#setup-players .player-row:first-child input', 'Вася');
  await shot(page, '02-setup');
  await page.click('#btn-start-local');
  await page.waitForSelector('#screen-game.active');
  await page.waitForTimeout(400);
  await shot(page, '03-board');
  // ходим за человека, пока не сыграем 12 ходов
  let turnsPlayed = 0, bought = 0;
  for (let i = 0; i < 400 && turnsPlayed < 12; i++) {
    const act = await page.evaluate(() => { if (document.querySelector('#dock.busy')) return null; const b = document.querySelector('#dock .main-actions .btn:not(:disabled)'); return b ? b.dataset.act : null; });
    if (!act || act === 'none') { await page.waitForTimeout(150); continue; }
    if (act === 'roll') { await page.click('#dock [data-act="roll"]'); turnsPlayed++; await page.waitForTimeout(300); continue; }
    if (act === 'buy') { await page.click('#dock [data-act="buy"]'); bought++; continue; }
    if (act === 'skip_buy') { await page.click('#dock [data-act="skip_buy"]'); continue; }
    if (act === 'end_turn') { await page.click('#dock [data-act="end_turn"]'); continue; }
    if (act === 'card_modal' || act === 'tax_modal' || act === 'auction_modal' || act === 'trade_modal' || act === 'manage') {
      // окна открываются сами; жмём первую подходящую кнопку
      const btn = await page.$('.modal [data-act="ack_card"], .modal [data-act="tax"][data-mode="flat"], .modal [data-act="pass"], .modal [data-act="trade_reject"]');
      if (btn) { if (i % 7 === 0 && act === 'card_modal') await shot(page, '04-card'); await btn.click(); } else await page.click(`#dock [data-act="${act}"]`);
      continue;
    }
    if (act === 'bankrupt') { await page.click('#dock [data-act="bankrupt"]'); const ok = await page.$('.modal [data-r="1"]'); if (ok) await ok.click(); continue; }
    await page.waitForTimeout(100);
  }
  log('local: turns', turnsPlayed, 'bought', bought);
  await page.waitForTimeout(500);
  // закрыть открытое окно, если есть, и снять доску
  await page.evaluate(() => { const m = document.querySelector('.modal'); if (m) m.remove(); });
  await shot(page, '05-midgame');
  // карточка клетки
  await page.click('.cell[data-idx="1"]');
  await page.waitForSelector('.modal .deed');
  await shot(page, '06-deed');
  await page.evaluate(() => document.querySelector('.modal').remove());
  // имущество
  const manageEnabled = await page.evaluate(() => !document.querySelector('#dock [data-act="manage"]').disabled);
  if (manageEnabled) { await page.click('#dock [data-act="manage"]'); await page.waitForSelector('.modal'); await shot(page, '07-manage'); await page.evaluate(() => document.querySelector('.modal').remove()); }
  // сохранение: перезагрузка → «Продолжить»
  const turnNoBefore = await page.evaluate(() => Number(document.querySelector('#dock .fine').textContent.replace(/\D/g, '')));
  await page.reload();
  await page.waitForSelector('#screen-menu.active');
  const canContinue = await page.evaluate(() => !document.querySelector('#btn-continue').hidden);
  if (!canContinue) throw new Error('кнопка «Продолжить» не появилась после перезагрузки');
  await page.click('#btn-continue');
  await page.waitForSelector('#screen-game.active');
  await page.waitForTimeout(300);
  const turnNoAfter = await page.evaluate(() => Number(document.querySelector('#dock .fine').textContent.replace(/\D/g, '')));
  if (turnNoAfter < turnNoBefore) throw new Error(`сохранение не восстановилось: ${turnNoBefore} → ${turnNoAfter}`);
  log('local: save/restore ok, turn', turnNoAfter);
  // тёмная тема
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForTimeout(200);
  await shot(page, '08-dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await ctx.close();

  // ---------- онлайн: две вкладки ----------
  const c1 = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const c2 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const a = await c1.newPage(); watch(a, 'host');
  const b = await c2.newPage(); watch(b, 'guest');
  await a.goto(base); await a.waitForSelector('#screen-menu.active');
  await a.click('#btn-online'); await a.waitForSelector('#screen-online.active');
  await a.fill('#online-name', 'Хост');
  await a.click('#btn-create-room');
  await a.waitForSelector('#online-lobby:not([hidden])');
  const code = await a.$eval('#lobby-code', (e) => e.textContent.trim());
  log('room code', code);
  await shot(a, '09-lobby-host');
  await b.goto(base + '?room=' + code); await b.waitForSelector('#screen-online.active');
  await b.fill('#online-name', 'Гость');
  await b.click('#btn-join-room');
  await b.waitForSelector('#online-lobby:not([hidden])');
  await a.waitForFunction(() => document.querySelectorAll('#lobby-players .item').length === 2);
  await a.click('#btn-add-bot');
  await a.waitForFunction(() => document.querySelectorAll('#lobby-players .item').length === 3);
  await shot(b, '10-lobby-guest');
  await a.click('#btn-start-online');
  await a.waitForSelector('#screen-game.active'); await b.waitForSelector('#screen-game.active');
  await a.waitForTimeout(500);
  await shot(a, '11-online-host');
  await shot(b, '12-online-guest-desktop');
  // играем по очереди тем, у кого активна кнопка
  let online = 0;
  for (let i = 0; i < 200 && online < 8; i++) {
    for (const pg of [a, b]) {
      const act = await pg.evaluate(() => { if (document.querySelector('#dock.busy')) return null; const bt = document.querySelector('#dock .main-actions .btn:not(:disabled)'); return bt ? bt.dataset.act : null; });
      if (!act || act === 'none') continue;
      if (act === 'roll') { await pg.click('#dock [data-act="roll"]'); online++; await pg.waitForTimeout(250); }
      else if (['buy', 'skip_buy', 'end_turn'].includes(act)) await pg.click(`#dock [data-act="${act}"]`);
      else {
        const btn = await pg.$('.modal [data-act="ack_card"], .modal [data-act="tax"][data-mode="flat"], .modal [data-act="pass"], .modal [data-act="trade_reject"]');
        if (btn) await btn.click();
      }
    }
    await a.waitForTimeout(120);
  }
  log('online: rolls', online);
  const t1 = await a.evaluate(() => document.querySelector('#dock .fine').textContent);
  const t2 = await b.evaluate(() => document.querySelector('#dock .fine').textContent);
  if (t1 !== t2) throw new Error(`состояния разошлись: ${t1} vs ${t2}`);
  await shot(a, '13-online-mid');
  await c1.close(); await c2.close();
  if (errors.length) { console.error('Ошибки в браузере:', errors); process.exitCode = 1; } else log('OK, без ошибок в консоли');
} finally {
  await browser.close();
  proc.kill();
}

// ---------- одностраничная сборка (dist/ponopoly.html) с диска ----------
{
  const { execSync } = await import('node:child_process');
  execSync(`${process.execPath} tools/bundle.mjs`, { cwd: ROOT, stdio: 'inherit' });
  const browser2 = await chromium.launch();
  const errs = [];
  try {
    const page = await browser2.newPage({ viewport: { width: 390, height: 844 } });
    page.on('pageerror', (e) => errs.push(e.message));
    await page.goto('file://' + path.join(ROOT, 'dist', 'ponopoly.html'));
    await page.waitForSelector('#screen-menu.active');
    await page.click('#btn-new');
    await page.click('#btn-start-local');
    await page.waitForSelector('#screen-game.active');
    await page.waitForFunction(() => !document.querySelector('#dock.busy') && document.querySelector('#dock [data-act="roll"]:not(:disabled)'));
    await page.click('#dock [data-act="roll"]');
    await page.waitForFunction(() => document.querySelector('#board .die[data-v="0"]') === null);
    await shot(page, '14-bundle');
    log('bundle: игра запускается из одного файла');
  } finally { await browser2.close(); }
  if (errs.length) { console.error('Ошибки в сборке:', errs); process.exitCode = 1; }
}
