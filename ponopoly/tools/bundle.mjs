// Собирает одностраничную версию игры: dist/ponopoly.html (полный документ, можно открыть
// с диска или положить на любой хостинг) и dist/artifact.html (фрагмент без <html>/<head>/<body>
// для публикации как Claude Artifact). ES-модули склеиваются в один классический скрипт.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const ORDER = ['data', 'engine', 'bot', 'telegram', 'storage', 'online', 'ui', 'main'];

function stripModule(src, name) {
  const exportedNames = [];
  let out = src
    .replace(/^import\s[^;]*?from\s+'[^']+';\s*$/gm, '')
    .replace(/^export\s+\{[^}]*\};?\s*$/gm, '')
    .replace(/^export\s+(async\s+)?function\s+([\w$]+)/gm, (m, a, n) => { exportedNames.push(n); return `${a || ''}function ${n}`; })
    .replace(/^export\s+class\s+([\w$]+)/gm, (m, n) => { exportedNames.push(n); return `class ${n}`; })
    .replace(/^export\s+(const|let)\s+([\w$]+)/gm, (m, k, n) => { exportedNames.push(n); return `${k} ${n}`; });
  if (/^\s*export\s/m.test(out)) throw new Error(`Необработанный export в ${name}`);
  if (name === 'main') out = out.replace(/^const \{[^}]*\} = UI;\s*$/m, ''); // имена уже в области видимости
  if (name === 'ui') out += `\nconst UI = { ${exportedNames.join(', ')} };\n`;
  return `// ===== ${name}.js =====\n${out}`;
}

const js = ORDER.map((n) => stripModule(read(`js/${n}.js`), n)).join('\n');
const css = read('css/styles.css');
const html = read('index.html');
const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('<script type="module"')).trim();
const head = html.slice(html.indexOf('<head>') + 6, html.indexOf('</head>'));
const fonts = head.match(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>/)[0];
const icon = head.match(/<link rel="icon"[^>]*>/)[0];
const appleMeta = head.match(/<meta name="apple-mobile-web-app-capable"[\s\S]*?<link rel="apple-touch-icon"[^>]*>/)[0];
const config = (extra) => `<script>window.PONOPOLY_CONFIG = ${JSON.stringify({ serverUrl: '', botName: '', appName: '', ...extra })};</script>`;

const full = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">
<meta name="theme-color" content="#1a2a35">
<title>Po'Nopoly</title>
${icon}
${appleMeta}
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
${fonts}
<style>
${css}
</style>
<script src="https://telegram.org/js/telegram-web-app.js?59"></script>
${config({})}
</head>
<body>
${body}
<script>
(() => {
${js}
})();
</script>
</body>
</html>
`;
fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'dist', 'ponopoly.html'), full);

const artifact = `<title>Po'Nopoly</title>
<meta name="claude:viewport-fit-sides" content="cover">
${appleMeta}
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
${fonts}
<style>
${css}
</style>
${config({ disableOnline: true })}
${body}
<script>
(() => {
${js}
})();
</script>
`;
const outArtifact = process.argv[2] || path.join(ROOT, 'dist', 'artifact.html');
fs.writeFileSync(outArtifact, artifact);
console.log('dist/ponopoly.html', (full.length / 1024).toFixed(0) + 'KB;', 'artifact →', outArtifact, (artifact.length / 1024).toFixed(0) + 'KB');
