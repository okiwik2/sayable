// Pins an ARASAAC pictogram (or "none") to vocabulary items, editing the data files in place.
// Usage: node scripts/set-symbol.mjs item-id=1234 other-item=none ...
// Find pictogram numbers at https://arasaac.org/pictograms/search
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from './lib/compile.mjs';
import { DATA } from './lib/vocab-source.mjs';

const { dataset } = compile();
const byId = new Map(dataset.items.map((i) => [i.id, i]));
const edits = new Map(); // file -> Map(line -> sym)
for (const arg of process.argv.slice(2)) {
  const [id, sym] = arg.split('=');
  const item = byId.get(id);
  if (!item) {
    console.error(`Unknown item "${id}"`);
    process.exitCode = 1;
    continue;
  }
  const [file, line] = item.where.split(':');
  const path = file.startsWith('vocab/') ? join(DATA, file) : join(DATA, file);
  if (!edits.has(path)) edits.set(path, new Map());
  edits.get(path).set(Number(line), sym);
}
for (const [path, lines] of edits) {
  const text = readFileSync(path, 'utf8').split('\n');
  for (const [line, sym] of lines) {
    let row = text[line - 1].replace(/\s+sym=\S+/, '');
    const parts = row.split('|');
    if (parts.length < 4) row += ' |';
    text[line - 1] = `${row.trimEnd()} sym=${sym}`;
  }
  writeFileSync(path, text.join('\n'));
}
console.log(`Updated ${[...edits.values()].reduce((n, m) => n + m.size, 0)} item(s).`);
