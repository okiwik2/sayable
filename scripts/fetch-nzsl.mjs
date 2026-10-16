// Links vocabulary items to New Zealand Sign Language (NZSL) dictionary entries and downloads
// the sign videos and drawings so they work offline.
//
// Source: NZSL Online / NZSL Dictionary data (https://www.nzsl.nz), Deaf Studies Research Unit,
// Victoria University of Wellington. Licence: CC BY-NC-SA 4.0 (non-commercial, with attribution).
// Data comes from the monthly releases of https://github.com/ODNZSL/nzsl-dictionary-scripts
//
// Matches are made by English word, so a match may be a different meaning of the same word.
// The app labels them "matched by word" until someone reviews them.
//
// Usage: npm run assets:nzsl [-- --no-media]
import { DatabaseSync } from 'node:sqlite';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import sharp from 'sharp';
import { compile } from './lib/compile.mjs';
import { DATA, ROOT } from './lib/vocab-source.mjs';

const CACHE = join(ROOT, '.cache', 'nzsl');
const OUT = join(ROOT, 'public', 'nzsl');
const MAP_FILE = join(DATA, 'signs', 'nzsl-map.json');
const noMedia = process.argv.includes('--no-media');
mkdirSync(CACHE, { recursive: true });
mkdirSync(join(DATA, 'signs'), { recursive: true });

async function download(url, file) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}

// 1. Latest dictionary release
const release = await fetch('https://api.github.com/repos/ODNZSL/nzsl-dictionary-scripts/releases/latest').then((r) => r.json());
const asset = (name) => release.assets.find((a) => a.name === name)?.browser_download_url;
const dbFile = join(CACHE, `${release.tag_name}.db`);
if (!existsSync(dbFile)) {
  console.log(`Downloading ${release.name}...`);
  await download(asset('nzsl.db'), dbFile);
}
const db = new DatabaseSync(dbFile, { readOnly: true });
const signs = db.prepare('select * from words').all();

// 2. Index signs by their English glosses
const norm = (s) => s.toLowerCase().replace(/[’']/g, "'").replace(/\(.*?\)/g, '').trim();
const index = new Map();
const add = (term, sign, score) => {
  const key = norm(term);
  if (!key) return;
  if (!index.has(key)) index.set(key, []);
  index.get(key).push({ sign, score });
};
for (const s of signs) {
  if (/offensive|obscene|vulgar/i.test(`${s.usage} ${s.usage_notes}`)) continue;
  (s.gloss ?? '').split(',').forEach((t, i) => add(t, s, i === 0 ? 3 : 2.5));
  (s.minor ?? '').split(',').forEach((t) => add(t, s, 1.5));
}
const posMatches = { verb: 'verb', noun: 'noun', adj: 'adjective', adv: 'adverb', pron: 'pronoun', q: 'question', interj: 'interjection', num: 'number' };

// 3. Match items
const { dataset } = compile();
const resources = [];
const links = {};
for (const item of dataset.items) {
  const en = item.forms.en;
  if (!en) continue;
  const terms = [en.say ?? en.text, ...(en.alt ?? [])].map((t) => t.replace(/[!?.…]/g, ''));
  const found = new Map();
  for (const [ti, term] of terms.entries()) {
    for (const { sign, score } of index.get(norm(term)) ?? []) {
      let s = score - ti * 0.5;
      if ((sign.word_classes ?? '').includes(posMatches[item.pos] ?? '-')) s += 0.5;
      s -= (Number(sign.variant_number) || 1) * 0.1;
      if (!found.has(sign.id) || found.get(sign.id).s < s) found.set(sign.id, { sign, s, term });
    }
  }
  const best = [...found.values()].sort((a, b) => b.s - a.s).slice(0, 3);
  if (!best.length) continue;
  links[item.id] = [];
  best.forEach(({ sign, term }, rank) => {
    const id = `nzsl-${sign.id}`;
    links[item.id].push(id);
    if (resources.some((r) => r.id === id)) return;
    resources.push({
      id,
      signLanguage: 'nzsl',
      gloss: sign.gloss,
      maori: sign.maori || undefined,
      hint: sign.hint || undefined,
      usage: sign.usage_notes || undefined,
      remoteVideo: sign.video,
      picture: sign.picture || undefined,
      source: `https://www.nzsl.nz/signs/${sign.id}`,
      matchedWord: term,
      rank,
    });
  });
}

// One resource can be linked to several items; store item ids on the resource for the app.
const out = [];
for (const r of resources) {
  for (const [itemId, ids] of Object.entries(links)) {
    const rank = ids.indexOf(r.id);
    if (rank !== -1) out.push({ ...r, itemId, rank, id: `${r.id}:${itemId}` });
  }
}

// 4. Media: the first-choice sign for each item is downloaded; alternatives stream when online.
const firstChoice = new Map(out.filter((r) => r.rank === 0).map((r) => [r.id.split(':')[0], r]));
if (!noMedia) {
  mkdirSync(join(OUT, 'video'), { recursive: true });
  mkdirSync(join(OUT, 'img'), { recursive: true });
  const jobs = [...firstChoice.entries()].filter(([sid]) => !existsSync(join(OUT, 'video', `${sid.slice(5)}.mp4`)));
  console.log(`Downloading ${jobs.length} sign videos...`);
  let done = 0;
  let next = 0;
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      while (next < jobs.length) {
        const [sid, r] = jobs[next++];
        try {
          await download(r.remoteVideo, join(OUT, 'video', `${sid.slice(5)}.mp4`));
        } catch (e) {
          console.warn(`  ${sid}: ${e.message}`);
        }
        if (++done % 100 === 0) console.log(`  ${done}/${jobs.length}`);
      }
    }),
  );

  // Drawings come in one large archive; extract only the ones we use and shrink them.
  const wanted = [...firstChoice.values()].filter((r) => r.picture && !existsSync(join(OUT, 'img', `${r.id.split(':')[0].slice(5)}.png`)));
  if (wanted.length) {
    const tarFile = join(CACHE, `${release.tag_name}-assets.tar.gz`);
    if (!existsSync(tarFile)) {
      console.log('Downloading sign drawings archive (about 100 MB)...');
      await download(asset('assets.tar.gz'), tarFile);
    }
    const extractDir = join(CACHE, 'assets');
    if (!existsSync(extractDir)) {
      mkdirSync(extractDir);
      // Relative paths: Git for Windows' tar reads "C:" as a remote host.
      execFileSync('tar', ['-xf', basename(tarFile), '-C', 'assets'], { cwd: CACHE });
    }
    const files = new Map();
    const walk = (dir) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) walk(join(dir, e.name));
        else files.set(e.name, join(dir, e.name));
      }
    };
    walk(extractDir);
    let made = 0;
    for (const r of wanted) {
      const src = files.get(r.picture);
      if (!src) continue;
      const png = await sharp(readFileSync(src))
        .resize(320, 320, { fit: 'inside', withoutEnlargement: true })
        .flatten({ background: '#ffffff' })
        .png({ palette: true, quality: 85, effort: 8 })
        .toBuffer();
      writeFileSync(join(OUT, 'img', `${r.id.split(':')[0].slice(5)}.png`), png);
      made++;
    }
    console.log(`Prepared ${made} sign drawings.`);
  }
}

// 5. Final map: point at local files when they exist.
const final = out.map((r) => {
  const sid = r.id.split(':')[0].slice(5);
  const video = existsSync(join(OUT, 'video', `${sid}.mp4`)) ? `nzsl/video/${sid}.mp4` : undefined;
  const image = existsSync(join(OUT, 'img', `${sid}.png`)) ? `nzsl/img/${sid}.png` : undefined;
  const { picture, ...rest } = r;
  return { ...rest, video, image };
});
writeFileSync(
  MAP_FILE,
  JSON.stringify(
    {
      source: release.name,
      attribution:
        'NZSL Online (www.nzsl.nz), Deaf Studies Research Unit, Victoria University of Wellington. McKee, D., McKee, R., Major, G., et al.',
      license: 'CC BY-NC-SA 4.0',
      resources: final,
    },
    null,
    1,
  ),
);
const items = new Set(final.map((r) => r.itemId)).size;
console.log(`Linked ${items} items to ${firstChoice.size} NZSL signs (${final.length} links incl. alternatives). Now run: npm run data`);
if (existsSync(join(CACHE, 'assets'))) rmSync(join(CACHE, 'assets'), { recursive: true, force: true });
