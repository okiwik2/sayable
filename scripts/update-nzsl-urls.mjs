// Updates the NZSL sign video addresses in data/signs/nzsl-map.json from the latest dictionary
// release, without changing which signs are matched to which words. NZSL Signbank moves its videos
// now and then (October 2026: every old address started returning 403), which breaks streaming
// in the website and the Play Store app.
//
// Usage: npm run assets:nzsl-urls   (then npm run data)
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATA, ROOT } from './lib/vocab-source.mjs';

const CACHE = join(ROOT, '.cache', 'nzsl');
const MAP_FILE = join(DATA, 'signs', 'nzsl-map.json');
mkdirSync(CACHE, { recursive: true });

const release = await fetch('https://api.github.com/repos/ODNZSL/nzsl-dictionary-scripts/releases/latest').then((r) => r.json());
const dbFile = join(CACHE, `${release.tag_name}.db`);
if (!existsSync(dbFile)) {
  console.log(`Downloading ${release.name}...`);
  const url = release.assets.find((a) => a.name === 'nzsl.db')?.browser_download_url;
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  writeFileSync(dbFile, Buffer.from(await res.arrayBuffer()));
}
const db = new DatabaseSync(dbFile, { readOnly: true });
const videos = new Map(db.prepare('select id, video from words').all().map((w) => [String(w.id), w.video]));

const map = JSON.parse(readFileSync(MAP_FILE, 'utf8'));
let changed = 0;
const missing = new Set();
for (const r of map.resources) {
  const sid = r.id.split(':')[0].slice(5);
  const video = videos.get(sid);
  if (!video) missing.add(sid);
  else if (r.remoteVideo !== video) {
    r.remoteVideo = video;
    changed++;
  }
}
map.source = release.name;
writeFileSync(MAP_FILE, JSON.stringify(map, null, 1));
console.log(`Updated ${changed} video addresses from ${release.name}.`);
if (missing.size) console.warn(`${missing.size} sign(s) are no longer in the dictionary: ${[...missing].join(', ')}`);
