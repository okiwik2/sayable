// Downloads the NZSL sign videos the app uses (listed in src/data/generated/signs-nzsl.json) into
// public/nzsl/video/, so the native apps can carry them and play signs offline. Skips files that
// are already there. Unlike `npm run assets:nzsl`, it never changes which signs are matched.
//
// Usage: npm run assets:videos
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ROOT } from './lib/vocab-source.mjs';

const pack = JSON.parse(readFileSync(join(ROOT, 'src', 'data', 'generated', 'signs-nzsl.json'), 'utf8'));
const jobs = Object.values(pack.signs)
  .filter((s) => s.video && s.remoteVideo)
  .map((s) => ({ file: join(ROOT, 'public', s.video), url: s.remoteVideo }))
  .filter((j, i, all) => all.findIndex((k) => k.file === j.file) === i && !existsSync(j.file));

console.log(`Downloading ${jobs.length} sign videos...`);
let next = 0;
let done = 0;
let failed = 0;
await Promise.all(
  Array.from({ length: 8 }, async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      try {
        const res = await fetch(job.url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        mkdirSync(dirname(job.file), { recursive: true });
        writeFileSync(job.file, Buffer.from(await res.arrayBuffer()));
      } catch (e) {
        failed++;
        console.warn(`  ${job.url}: ${e.message}`);
      }
      if (++done % 100 === 0) console.log(`  ${done}/${jobs.length}`);
    }
  }),
);
console.log(`Done. ${done - failed} downloaded, ${failed} failed.`);
if (failed > jobs.length / 10) process.exit(1);
