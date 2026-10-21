// Builds Sayable Lite into dist/lite/: a small plain-JavaScript version for old, slow devices
// (e.g. iPad 4 on iOS 10). No framework, small pictures, and an AppCache manifest so it works
// offline on browsers that are too old for service workers.
// Run after `vite build` (part of `npm run build`).
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'acorn';
import sharp from 'sharp';
import { ROOT } from './lib/vocab-source.mjs';

const SRC = join(ROOT, 'lite');
const OUT = join(ROOT, 'dist', 'lite');
const SYMBOLS = join(ROOT, 'public', 'symbols', 'arasaac');
// Resized pictures are kept between builds; making them takes a while.
const CACHE = join(ROOT, 'node_modules', '.cache', 'sayable-lite', 'symbols');
const SYMBOL_PX = 144;

const dataset = JSON.parse(readFileSync(join(ROOT, 'src', 'data', 'generated', 'vocabulary.json'), 'utf8'));

// Word-type colours, as in src/ui/Tile.tsx.
const NEGATIONS = new Set([
  'not', 'no', 'dont', 'cant', 'wont', 'isnt', 'didnt', 'doesnt', 'dont-like', 'dont-know', 'dont-understand',
  'zh-mei', 'zh-bie', 'zh-buyao', 'zh-meiyou', 'zh-bushi', 'zh-bukeyi', 'stop', 'no-urgent', 'stop-urgent', 'q-no', 'q-stop',
]);
const POS_HUE = {
  pron: 'yellow', verb: 'green', adj: 'blue', noun: 'orange', interj: 'pink', q: 'purple',
  adv: 'grey', prep: 'grey', conj: 'grey', det: 'grey', particle: 'grey', measure: 'grey', num: 'grey',
};
const catHue = new Map(dataset.categories.map((c) => [c.id, c.hue]));
const hueFor = (item) =>
  item.kind === 'word' ? (NEGATIONS.has(item.id) ? 'red' : POS_HUE[item.pos]) : catHue.get(item.category);

// Compact data: arrays instead of objects keep the file small and quick to parse.
const symbolIds = new Set();
const sym = (s) => {
  if (s?.set !== 'arasaac') return 0;
  symbolIds.add(s.id);
  return s.id;
};
const items = {};
for (const i of dataset.items) {
  const en = i.forms.en, zh = i.forms.zh;
  // [English, English spoken, simplified, traditional, pinyin, Chinese spoken, symbol, hue]
  items[i.id] = [en?.text ?? '', en?.say ?? '', zh?.hans ?? '', zh?.hant ?? '', zh?.pinyin ?? '', zh?.say ?? '', sym(i.symbol), hueFor(i) ?? ''];
}
const cats = dataset.categories.map((c) => [
  c.id, c.parent ?? '', c.name.en, c.name.zh, c.hue, sym(c.symbol),
  dataset.categories.filter((x) => x.parent === c.id).map((x) => x.id),
  dataset.items.filter((i) => i.categories.includes(c.id)).map((i) => i.id),
]);
const boards = dataset.boards.map((b) => [b.id, b.kind, b.lang ?? '', b.level ?? '', b.cols, b.name.en, b.name.zh, b.cells]);
const quick = dataset.quickGroups.map((q) => [q.id, q.name.en, q.name.zh, q.items]);
const data = `window.SAYABLE_DATA=${JSON.stringify({ items, cats, boards, quick })};\n`;

// The app script must stay ES5 so iOS 10 Safari can run it without a transpiler.
const appJs = readFileSync(join(SRC, 'app.js'), 'utf8');
try {
  parse(appJs, { ecmaVersion: 5 });
} catch (e) {
  console.error(`lite/app.js is not plain ES5 (${e.message}). Old iPads would show a blank page.`);
  process.exit(1);
}

mkdirSync(join(OUT, 's'), { recursive: true });
mkdirSync(CACHE, { recursive: true });

const pictures = [];
const missing = [];
const ids = [...symbolIds];
for (let n = 0; n < ids.length; n += 16) {
  await Promise.all(ids.slice(n, n + 16).map(async (id) => {
    const src = join(SYMBOLS, `${id}.png`);
    if (!existsSync(src)) return missing.push(id);
    const cached = join(CACHE, `${id}.png`);
    if (!existsSync(cached)) {
      await sharp(src).resize(SYMBOL_PX, SYMBOL_PX, { fit: 'inside' })
        .png({ palette: true, colors: 32, quality: 70, compressionLevel: 9, effort: 10 }).toFile(cached);
    }
    copyFileSync(cached, join(OUT, 's', `${id}.png`));
    pictures.push(`s/${id}.png`);
  }));
}
if (missing.length) console.warn(`Sayable Lite: ${missing.length} symbol(s) not downloaded (npm run assets:symbols).`);

writeFileSync(join(OUT, 'data.js'), data);
writeFileSync(join(OUT, 'app.js'), appJs);
copyFileSync(join(SRC, 'app.css'), join(OUT, 'app.css'));
copyFileSync(join(ROOT, 'public', 'icons', 'apple-touch-icon.png'), join(OUT, 'icon.png'));

// The manifest changes whenever any file does, so devices fetch the update.
const files = ['app.css', 'app.js', 'data.js', 'icon.png', ...pictures.sort()];
const hash = createHash('sha256');
hash.update(readFileSync(join(SRC, 'index.html')));
for (const f of files) hash.update(f).update(readFileSync(join(OUT, f)));
writeFileSync(
  join(OUT, 'sayable.appcache'),
  `CACHE MANIFEST\n# ${hash.digest('hex').slice(0, 16)}\n\nCACHE:\n${files.join('\n')}\n\nNETWORK:\n*\n`,
);
copyFileSync(join(SRC, 'index.html'), join(OUT, 'index.html'));

const kb = (f) => readFileSync(join(OUT, f)).length / 1024;
const pictureKb = readdirSync(join(OUT, 's')).reduce((t, f) => t + kb(join('s', f)), 0);
console.log(
  `Sayable Lite: app ${(kb('app.js') + kb('app.css') + kb('index.html')).toFixed(0)} KB, ` +
    `words ${kb('data.js').toFixed(0)} KB, ${pictures.length} pictures ${(pictureKb / 1024).toFixed(1)} MB.`,
);
