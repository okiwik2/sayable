// Builds the app's data files in src/data/generated/ from the files in data/.
// Run with: npm run data
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from './lib/compile.mjs';
import { ROOT } from './lib/vocab-source.mjs';

const { dataset, signPack, errors, warnings } = compile();
if (warnings.length) console.warn(`${warnings.length} warning(s) - run npm run data:validate to see them.`);
if (errors.length) {
  for (const e of errors) console.error('error:', e);
  console.error(`\n${errors.length} error(s). Vocabulary not built.`);
  process.exit(1);
}
const outDir = join(ROOT, 'src', 'data', 'generated');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'vocabulary.json'), JSON.stringify(dataset));
// Sign data is loaded separately so the main screen does not wait for it.
writeFileSync(join(outDir, 'signs-nzsl.json'), JSON.stringify(signPack));
const words = dataset.items.filter((i) => i.kind === 'word').length;
const phrases = dataset.items.length - words;
const zh = dataset.items.filter((i) => i.forms.zh).length;
const en = dataset.items.filter((i) => i.forms.en).length;
const withSymbol = dataset.items.filter((i) => i.symbol).length;
console.log(
  `Built ${dataset.items.length} items (${words} words, ${phrases} phrases; ${en} English, ${zh} Mandarin; ` +
    `${withSymbol} with symbols), ${dataset.categories.length} categories, ${dataset.boards.length} boards, ` +
    `${Object.keys(signPack.signs).length} NZSL signs linked to ${Object.keys(signPack.links).length} items.`,
);
