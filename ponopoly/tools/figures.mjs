// Собирает assets/figures/*.svg в js/figures.js (inline SVG фигурок игроков),
// чтобы фишки работали и в модульной версии, и в сборке одним файлом.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(ROOT, 'assets', 'figures');
const out = {};
const forbidden = /<(script|image|use|foreignObject|text|style)\b|href\s*=|javascript:/i;
for (const f of fs.existsSync(dir) ? fs.readdirSync(dir).filter((x) => x.endsWith('.svg')).sort() : []) {
  const id = f.replace(/\.svg$/, '');
  let svg = fs.readFileSync(path.join(dir, f), 'utf8').replace(/<\?xml[^>]*>\s*/g, '').replace(/<!--[\s\S]*?-->/g, '').trim();
  if (forbidden.test(svg)) { console.error(`фигурка ${id}: запрещённые элементы, пропущена`); continue; }
  if (!/^<svg[\s>]/.test(svg) || !svg.endsWith('</svg>')) { console.error(`фигурка ${id}: не SVG, пропущена`); continue; }
  if (svg.length > 12000) { console.error(`фигурка ${id}: слишком большая (${svg.length})`); continue; }
  svg = svg.replace(/\s+/g, ' ').replace(/> </g, '><');
  out[id] = svg;
}
fs.writeFileSync(path.join(ROOT, 'js', 'figures.js'), `// Сгенерировано tools/figures.mjs из assets/figures/*.svg — не редактировать вручную.\nexport const FIGURES = ${JSON.stringify(out, null, 0)};\n`);
console.log('js/figures.js:', Object.keys(out).join(', ') || '(пусто)');
