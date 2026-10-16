// Reads the human-editable vocabulary files in data/ and turns them into plain objects.
// Shared by build-vocab.mjs, validate-vocab.mjs and the asset fetch scripts.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const DATA = join(ROOT, 'data');

const POS = new Set([
  'noun', 'verb', 'adj', 'adv', 'pron', 'det', 'prep', 'conj', 'interj', 'num', 'q', 'particle', 'measure', 'phrase',
]);
const FLAGS = new Set(['essential', 'unc', 'modal']);

export function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Split "a;b;c" into labels, treating "-" as "not available in this language". */
function labels(field) {
  const f = field.trim();
  if (!f || f === '-') return [];
  return f.split(';').map((s) => s.trim()).filter(Boolean);
}

/** Parse the options column: "id=foo kw=a,b essential gloss=two_words". */
function parseOptions(field, where, errors) {
  const opts = {};
  for (const tok of field.trim().split(/\s+/).filter(Boolean)) {
    const eq = tok.indexOf('=');
    if (eq === -1) {
      if (!FLAGS.has(tok)) errors.push(`${where}: unknown flag "${tok}"`);
      opts[tok] = true;
      continue;
    }
    const key = tok.slice(0, eq);
    const value = tok.slice(eq + 1).replace(/_/g, ' ');
    opts[key] = value;
  }
  return opts;
}

function lines(file) {
  return readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map((text, i) => ({ text, line: i + 1 }))
    .filter(({ text }) => text.trim() && !text.trim().startsWith('#'));
}

function parseItemLine(text, where, category, errors) {
  const parts = text.split('|');
  if (parts.length < 3) {
    errors.push(`${where}: expected "English | Chinese | part of speech | options"`);
    return null;
  }
  const [enField, zhField, posField, optField = ''] = parts;
  const en = labels(enField);
  const zh = labels(zhField);
  const pos = posField.trim();
  if (!POS.has(pos)) errors.push(`${where}: unknown part of speech "${pos}"`);
  if (!en.length && !zh.length) errors.push(`${where}: needs an English or Chinese label`);
  const opts = parseOptions(optField, where, errors);
  return { en, zh, pos, opts, category, where };
}

export function parseCategories(errors = []) {
  const cats = [];
  for (const { text, line } of lines(join(DATA, 'categories.txt'))) {
    const [id, parent, en, zh, hue, symq] = text.split('|').map((s) => s.trim());
    if (!id || !en || !zh) {
      errors.push(`categories.txt:${line}: incomplete category`);
      continue;
    }
    cats.push({ id, parent: parent === '-' ? null : parent, name: { en, zh }, hue: hue || 'grey', symq: symq || en });
  }
  return cats;
}

export function parseVocabFiles(errors = []) {
  const dir = join(DATA, 'vocab');
  const raw = [];
  for (const name of readdirSync(dir).filter((f) => f.endsWith('.txt')).sort()) {
    let category = null;
    for (const { text, line } of lines(join(dir, name))) {
      const where = `vocab/${name}:${line}`;
      const t = text.trim();
      if (t.startsWith('@')) {
        category = t.slice(1).trim();
        continue;
      }
      if (!category) {
        errors.push(`${where}: item before any "@ category" line`);
        continue;
      }
      const item = parseItemLine(text, where, category, errors);
      if (item) raw.push(item);
    }
  }
  return raw;
}

export function parseQuickPhrases(errors = []) {
  const groups = [];
  const items = [];
  let group = null;
  for (const { text, line } of lines(join(DATA, 'quick-phrases.txt'))) {
    const where = `quick-phrases.txt:${line}`;
    const t = text.trim();
    if (t.startsWith('@group')) {
      const [id, en, zh] = t.slice(6).split('|').map((s) => s.trim());
      group = { id, name: { en, zh }, items: [] };
      groups.push(group);
      continue;
    }
    if (!group) {
      errors.push(`${where}: phrase before any "@group" line`);
      continue;
    }
    if (t.startsWith('>')) {
      group.items.push(t.slice(1).trim());
      continue;
    }
    const item = parseItemLine(text, where, 'social', errors);
    if (!item) continue;
    item.quick = true;
    items.push(item);
    group.items.push(item.opts.id ?? `__pending__${items.length - 1}`);
  }
  return { groups, items };
}

export function parseBoards(errors = []) {
  const boards = [];
  let board = null;
  for (const { text, line } of lines(join(DATA, 'boards.txt'))) {
    const where = `boards.txt:${line}`;
    const t = text.trim();
    if (t.startsWith('@board')) {
      const [id, en, zh, optField = ''] = t.slice(6).split('|').map((s) => s.trim());
      const opts = parseOptions(optField, where, errors);
      board = {
        id,
        name: { en, zh },
        kind: opts.kind ?? 'context',
        lang: opts.lang ?? null,
        level: opts.level ?? null,
        cols: Number(opts.cols ?? 6),
        rows: [],
        where,
      };
      boards.push(board);
      continue;
    }
    if (!board) {
      errors.push(`${where}: row before any "@board" line`);
      continue;
    }
    if (!t.startsWith('row:')) {
      errors.push(`${where}: expected "row:"`);
      continue;
    }
    const cells = t.slice(4).trim().split(/\s+/).map((c) => (c === '_' ? null : c));
    board.rows.push({ cells, where });
  }
  return boards;
}

export function parsePredictions(errors = []) {
  const file = join(DATA, 'predict.txt');
  const seeds = { en: {}, zh: {} };
  if (!existsSync(file)) return seeds;
  let lang = null;
  for (const { text, line } of lines(file)) {
    const t = text.trim();
    if (t.startsWith('@lang')) {
      lang = t.slice(5).trim();
      continue;
    }
    const [from, to] = t.split(':');
    if (!lang || !to) {
      errors.push(`predict.txt:${line}: expected "item-id: next-id, next-id"`);
      continue;
    }
    seeds[lang][from.trim()] = to.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return seeds;
}
