// Finds an ARASAAC pictogram for each vocabulary item and downloads it into public/symbols/arasaac/.
// Results are remembered in data/symbols/arasaac-map.json so later runs only look up new words.
//
// ARASAAC pictograms: author Sergio Palao, origin ARASAAC (https://arasaac.org),
// licence CC BY-NC-SA 4.0, owner Government of Aragón (Spain). Non-commercial use only.
//
// Usage: npm run assets:symbols [-- --retry-missing] [-- --refresh]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { compile } from './lib/compile.mjs';
import { DATA, ROOT } from './lib/vocab-source.mjs';

const API = 'https://api.arasaac.org/v1/pictograms';
const STATIC = 'https://static.arasaac.org/pictograms';
const MAP_FILE = join(DATA, 'symbols', 'arasaac-map.json');
const OUT_DIR = join(ROOT, 'public', 'symbols', 'arasaac');
const refresh = process.argv.includes('--refresh');
const retryMissing = process.argv.includes('--retry-missing');

mkdirSync(join(DATA, 'symbols'), { recursive: true });
mkdirSync(OUT_DIR, { recursive: true });
const map = !refresh && existsSync(MAP_FILE) ? JSON.parse(readFileSync(MAP_FILE, 'utf8')) : {};

const { dataset, symbolQueries, categoriesSrc } = compile({ keepMissingSymbols: true });

/** The words we search ARASAAC with, or null when the item should stay text-only. */
function searchTerm({ item, symq }) {
  if (symq) return symq;
  if (item.pos === 'particle' || item.pos === 'measure') return null;
  if (item.forms.en) return item.forms.en.text.replace(/\(.*?\)/g, '').replace(/[!?.…]/g, '').trim();
  const gloss = item.forms.zh?.gloss;
  if (!gloss || gloss.startsWith('(')) return null;
  return gloss.split(/[,;(]/)[0].trim();
}

async function getJson(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url);
    if (res.status === 404) return [];
    if (res.ok) return res.json();
    await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
  }
  throw new Error(`Failed: ${url}`);
}

const norm = (s) => s.toLowerCase().replace(/[’']/g, '').trim();

/**
 * ARASAAC's fuzzy search returns unrelated pictures when nothing matches (often "New Year's Eve"),
 * so only accept a pictogram whose own keywords contain the search term.
 */
function relevant(result, term) {
  const t = norm(term);
  return (result.keywords ?? []).some((k) => {
    const kw = norm(k.keyword ?? '');
    return kw === t || kw.split(/[\s,]+/).includes(t) || (t.includes(' ') && kw.includes(t));
  });
}

async function lookup(term, { exactOnly }) {
  const enc = encodeURIComponent(norm(term));
  let results = (await getJson(`${API}/en/bestsearch/${enc}`)).filter((r) => relevant(r, term));
  if (!results.length && !exactOnly) {
    results = (await getJson(`${API}/en/search/${enc}`)).filter((r) => relevant(r, term));
  }
  const suitable = results.filter((r) => !r.sex && !r.violence);
  return suitable[0]?._id ?? null;
}

async function download(id) {
  const file = join(OUT_DIR, `${id}.png`);
  if (existsSync(file)) return false;
  let res = await fetch(`${STATIC}/${id}/${id}_300.png`);
  if (res.status === 404) res = await fetch(`${STATIC}/${id}/${id}_500.png`);
  if (!res.ok) throw new Error(`Image ${id}: HTTP ${res.status}`);
  writeFileSync(file, await compress(Buffer.from(await res.arrayBuffer())));
  return true;
}

/** 300px palette PNGs are about 30% smaller and look the same for flat pictograms. */
function compress(buffer) {
  return sharp(buffer)
    .resize(300, 300, { fit: 'inside', withoutEnlargement: true })
    .png({ palette: true, quality: 90, effort: 8 })
    .toBuffer();
}

if (process.argv.includes('--recompress')) {
  const { readdirSync } = await import('node:fs');
  for (const f of readdirSync(OUT_DIR)) {
    const p = join(OUT_DIR, f);
    writeFileSync(p, await compress(readFileSync(p)));
  }
  console.log('Recompressed existing images.');
}

async function pool(tasks, size) {
  let next = 0;
  const workers = Array.from({ length: size }, async () => {
    while (next < tasks.length) await tasks[next++]();
  });
  await Promise.all(workers);
}

const jobs = [];
for (const q of symbolQueries) {
  if (q.item.explicitSym) continue; // pinned with sym= in the data file
  if (q.id in map && !(retryMissing && map[q.id] === null)) continue;
  const term = searchTerm(q);
  if (!term) continue;
  jobs.push({ key: q.id, term, exactOnly: q.item.kind === 'phrase' });
}
for (const c of categoriesSrc) {
  const key = `category:${c.id}`;
  if (/^d+$/.test(c.symq)) continue; // pinned by number in categories.txt
  if (key in map && !(retryMissing && map[key] === null)) continue;
  jobs.push({ key, term: c.symq, exactOnly: false });
}

let found = 0;
let done = 0;
console.log(`Looking up ${jobs.length} symbols on ARASAAC...`);
await pool(
  jobs.map((job) => async () => {
    try {
      map[job.key] = await lookup(job.term, job);
      if (map[job.key]) found++;
    } catch (e) {
      console.warn(`  ${job.key}: ${e.message}`);
    }
    if (++done % 100 === 0) {
      console.log(`  ${done}/${jobs.length}`);
      writeFileSync(MAP_FILE, JSON.stringify(sortKeys(map), null, 1));
    }
  }),
  6,
);
writeFileSync(MAP_FILE, JSON.stringify(sortKeys(map), null, 1));
console.log(`Found ${found} new symbols.`);

// Download every symbol the data uses (explicit sym= ids too).
const ids = new Set(Object.values(map).filter(Boolean));
for (const item of dataset.items) if (item.symbol) ids.add(item.symbol.id);
for (const item of symbolQueries) if (item.item.symbol) ids.add(item.item.symbol.id);
for (const c of dataset.categories) if (c.symbol) ids.add(c.symbol.id);
for (const c of categoriesSrc) if (/^d+$/.test(c.symq)) ids.add(Number(c.symq));
let downloaded = 0;
await pool(
  [...ids].map((id) => async () => {
    try {
      if (await download(id)) downloaded++;
    } catch (e) {
      console.warn(`  ${e.message}`);
    }
  }),
  6,
);
// Remove images nothing uses any more, so the offline download stays small.
const { readdirSync, unlinkSync } = await import('node:fs');
let removed = 0;
for (const f of readdirSync(OUT_DIR)) {
  if (!ids.has(Number(f.replace('.png', '')))) {
    unlinkSync(join(OUT_DIR, f));
    removed++;
  }
}
console.log(`Downloaded ${downloaded} new images, removed ${removed} unused (${ids.size} in use). Now run: npm run data`);

function sortKeys(obj) {
  return Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)));
}
