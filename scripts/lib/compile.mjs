// Compiles the parsed source files into the dataset the app loads, and checks it for mistakes.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pinyin } from 'pinyin-pro';
import * as OpenCC from 'opencc-js';
import {
  DATA,
  ROOT,
  slugify,
  parseCategories,
  parseVocabFiles,
  parseQuickPhrases,
  parseBoards,
  parsePredictions,
} from './vocab-source.mjs';

const toTraditional = OpenCC.Converter({ from: 'cn', to: 'tw' });

const TONE_MARKS = {
  ā: ['a', 1], á: ['a', 2], ǎ: ['a', 3], à: ['a', 4],
  ē: ['e', 1], é: ['e', 2], ě: ['e', 3], è: ['e', 4],
  ī: ['i', 1], í: ['i', 2], ǐ: ['i', 3], ì: ['i', 4],
  ō: ['o', 1], ó: ['o', 2], ǒ: ['o', 3], ò: ['o', 4],
  ū: ['u', 1], ú: ['u', 2], ǔ: ['u', 3], ù: ['u', 4],
  ǖ: ['ü', 1], ǘ: ['ü', 2], ǚ: ['ü', 3], ǜ: ['ü', 4],
};

/** "xǐ" -> { plain: "xi", num: "xi3" } ; neutral tone gets 5. */
export function syllableToNumber(syl) {
  let tone = 5;
  let plain = '';
  for (const ch of syl.normalize('NFC')) {
    if (TONE_MARKS[ch]) {
      plain += TONE_MARKS[ch][0];
      tone = TONE_MARKS[ch][1];
    } else plain += ch;
  }
  plain = plain.toLowerCase().replace(/ü/g, 'v');
  return { plain, num: /[a-z]/.test(plain) ? plain + tone : plain };
}

/** Join syllables the way Hanyu Pinyin writes a single word: "xǐ huan" -> "xǐhuan", "xī ān" -> "xī'ān". */
export function joinWord(syllables) {
  return syllables.reduce((acc, syl, i) => {
    if (i === 0) return syl;
    return acc + (/^[aeoāáǎàēéěèōóǒò]/i.test(syl) ? "'" : '') + syl;
  }, '');
}

function zhPunctuation(text) {
  return text.replace(/\?/g, '？').replace(/!/g, '！').replace(/,/g, '，').replace(/:/g, '：');
}

function syllablesFor(hans, override) {
  if (override) return override.split(/\s+/).filter(Boolean);
  return pinyin(hans, { type: 'array', nonZh: 'removed' }).filter((s) => /\p{L}/u.test(s));
}

function zhForm(hans, { override, isPhrase }) {
  const syl = syllablesFor(hans, override);
  const nums = syl.map(syllableToNumber);
  return {
    hans,
    hant: toTraditional(hans),
    pinyin: isPhrase ? syl.join(' ') : joinWord(syl),
    pinyinNum: nums.map((n) => n.num).join(' '),
    pinyinPlain: nums.map((n) => n.plain).join(''),
  };
}

function readJson(path, fallback) {
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : fallback;
}

/**
 * @returns {{ dataset: object, errors: string[], warnings: string[] }}
 */
export function compile({ requireAssets = false, keepMissingSymbols = false } = {}) {
  const errors = [];
  const warnings = [];
  const categories = parseCategories(errors);
  const catIds = new Set(categories.map((c) => c.id));
  for (const c of categories) {
    if (c.parent && !catIds.has(c.parent)) errors.push(`categories.txt: "${c.id}" has unknown parent "${c.parent}"`);
  }

  const raw = parseVocabFiles(errors);
  const quick = parseQuickPhrases(errors);
  const boardsSrc = parseBoards(errors);
  const seeds = parsePredictions(errors);
  const symbolMap = readJson(join(DATA, 'symbols', 'arasaac-map.json'), {});
  const signMap = readJson(join(DATA, 'signs', 'nzsl-map.json'), { resources: [], links: {} });

  const items = [];
  const byId = new Map();
  const addItem = (src) => {
    const isPhrase = src.pos === 'phrase';
    let id = src.opts.id;
    if (!id) {
      id = src.en.length
        ? slugify(src.en[0])
        : 'zh-' + syllablesFor(src.zh[0], src.opts.py).map((s) => syllableToNumber(s).plain).join('');
    }
    if (byId.has(id)) {
      errors.push(`${src.where}: duplicate id "${id}" (first used at ${byId.get(id).where}). Add id=something-else.`);
      return null;
    }
    const cats = [src.category, ...(src.opts.cat ? src.opts.cat.split(',').map((s) => s.trim()) : [])];
    for (const c of cats) if (!catIds.has(c)) errors.push(`${src.where}: unknown category "${c}"`);

    const forms = {};
    if (src.en.length) {
      forms.en = { text: src.en[0] };
      if (src.en.length > 1) forms.en.alt = src.en.slice(1);
      if (src.opts.say) forms.en.say = src.opts.say;
    }
    if (src.zh.length) {
      const hans = zhPunctuation(src.zh[0]);
      forms.zh = zhForm(hans, { override: src.opts.py, isPhrase });
      if (src.zh.length > 1) {
        forms.zh.alt = src.zh.slice(1).map((h) => zhForm(zhPunctuation(h), { isPhrase }));
      }
      if (src.opts.gloss) forms.zh.gloss = src.opts.gloss;
      if (!forms.zh.pinyin) errors.push(`${src.where}: could not work out pinyin for "${hans}"`);
    }

    const grammar = {};
    if (src.opts.person) grammar.person = Number(src.opts.person);
    if (src.opts.modal) grammar.modal = true;
    if (src.opts.unc) grammar.uncountable = true;
    const irregular = {};
    for (const k of ['past', 'pp', 'ing', 's', 'pl']) if (src.opts[k]) irregular[k] = src.opts[k];
    if (Object.keys(irregular).length) grammar.irregular = irregular;

    const item = {
      id,
      kind: isPhrase ? 'phrase' : 'word',
      pos: src.pos,
      category: cats[0],
      categories: [...new Set(cats)],
      forms,
    };
    if (src.opts.essential) item.essential = true;
    if (src.opts.kw) item.keywords = src.opts.kw.split(',').map((s) => s.trim()).filter(Boolean);
    if (Object.keys(grammar).length) item.grammar = grammar;
    if (src.quick) item.quick = true;
    // Symbols: explicit id, explicit "none", or whatever the ARASAAC lookup found.
    if (src.opts.sym && src.opts.sym !== 'none') {
      item.symbol = { set: 'arasaac', id: Number(src.opts.sym) };
    } else if (!src.opts.sym && symbolMap[id]) {
      item.symbol = { set: 'arasaac', id: symbolMap[id] };
    }
    Object.defineProperty(item, 'where', { value: src.where, enumerable: false });
    Object.defineProperty(item, 'symq', { value: src.opts.symq, enumerable: false });
    Object.defineProperty(item, 'explicitSym', { value: Boolean(src.opts.sym), enumerable: false });
    items.push(item);
    byId.set(id, item);
    return item;
  };

  for (const src of raw) addItem(src);
  quick.items.forEach((src, i) => {
    const item = addItem(src);
    if (!item) return;
    for (const g of quick.groups) g.items = g.items.map((x) => (x === `__pending__${i}` ? item.id : x));
  });
  for (const g of quick.groups) {
    for (const ref of g.items) if (!byId.has(ref)) errors.push(`quick-phrases.txt: group "${g.id}" uses unknown item "${ref}"`);
  }

  // Boards
  const boards = boardsSrc.map((b) => {
    const cells = [];
    for (const row of b.rows) {
      if (b.kind === 'core' && row.cells.length !== b.cols) {
        errors.push(`${row.where}: core board "${b.id}" rows must have ${b.cols} cells (found ${row.cells.length})`);
      }
      for (const ref of row.cells) {
        if (ref === null) {
          cells.push(null);
          continue;
        }
        const item = byId.get(ref);
        if (!item) errors.push(`${row.where}: unknown item "${ref}" on board "${b.id}"`);
        else if (b.lang && !item.forms[b.lang]) errors.push(`${row.where}: "${ref}" has no ${b.lang} form but is on ${b.lang} board "${b.id}"`);
        cells.push(ref);
      }
    }
    return { id: b.id, name: b.name, kind: b.kind, lang: b.lang, level: b.level, cols: b.cols, cells };
  });

  // Frequency: words on smaller core boards are the most frequent.
  const coreRank = new Map();
  const levelScore = { starter: 1, standard: 0.85, extended: 0.7 };
  for (const b of boards.filter((x) => x.kind === 'core')) {
    for (const ref of b.cells) {
      if (!ref) continue;
      coreRank.set(ref, Math.max(coreRank.get(ref) ?? 0, levelScore[b.level] ?? 0.6));
    }
  }
  for (const item of items) {
    const core = coreRank.get(item.id);
    if (core) item.core = true;
    item.frequency = core ?? (item.essential ? 0.6 : item.kind === 'phrase' ? 0.35 : 0.4);
  }

  // Prediction seeds
  for (const lang of ['en', 'zh']) {
    for (const [from, tos] of Object.entries(seeds[lang] ?? {})) {
      if (!byId.has(from)) errors.push(`predict.txt: unknown item "${from}" (${lang})`);
      for (const entry of tos) {
        // "want+s" means: suggest the item "want" in its "s" form (wants).
        const [to, form] = entry.split('+');
        if (form && !['s', 'past', 'pp', 'ing', 'pl'].includes(form)) {
          errors.push(`predict.txt: "${entry}" uses unknown form "${form}" (use s, past, pp, ing or pl)`);
        }
        if (!byId.has(to)) errors.push(`predict.txt: "${from}" suggests unknown item "${to}" (${lang})`);
        else if (!byId.get(to).forms[lang]) errors.push(`predict.txt: "${to}" has no ${lang} form (after "${from}")`);
      }
    }
  }

  // Duplicate-label warnings (similar items are allowed, but flag accidental copies).
  // Chinese often uses one word for several English ones (I/me = 我), so Chinese labels are only
  // compared between Chinese-only items. Quick phrases live in their own list and are skipped.
  const seen = new Map();
  for (const item of items) {
    if (item.quick) continue;
    for (const lang of ['en', 'zh']) {
      const label = lang === 'en' ? item.forms.en?.text : item.forms.en ? undefined : item.forms.zh?.hans;
      if (!label) continue;
      const key = `${lang}:${item.category}:${label.toLowerCase()}`;
      if (seen.has(key)) warnings.push(`"${label}" appears twice in ${item.category}: ${seen.get(key)} and ${item.id}`);
      else seen.set(key, item.id);
    }
  }

  // Symbols must exist on disk.
  const symbolDir = join(ROOT, 'public', 'symbols', 'arasaac');
  let missingSymbols = 0;
  for (const item of items) {
    if (!keepMissingSymbols && item.symbol && !existsSync(join(symbolDir, `${item.symbol.id}.png`))) {
      missingSymbols++;
      if (requireAssets) errors.push(`${item.where}: symbol file ${item.symbol.id}.png is missing (run npm run assets:symbols)`);
      delete item.symbol;
    }
  }
  if (missingSymbols && !requireAssets) warnings.push(`${missingSymbols} symbol images are not downloaded yet (npm run assets:symbols)`);

  // Category symbols
  const outCategories = categories.map((c) => {
    const out = { id: c.id, parent: c.parent, name: c.name, hue: c.hue };
    const sym = /^d+$/.test(c.symq) ? Number(c.symq) : symbolMap[`category:${c.id}`];
    if (sym && existsSync(join(symbolDir, `${sym}.png`))) out.symbol = { set: 'arasaac', id: sym };
    return out;
  });

  // Sign resources: each sign stored once, plus a list of signs per item (best match first).
  const signs = {};
  const links = {};
  let staleLinks = 0;
  for (const r of signMap.resources ?? []) {
    if (!byId.has(r.itemId)) {
      staleLinks++;
      continue;
    }
    const sid = r.id.split(':')[0];
    if (requireAssets && r.video && !existsSync(join(ROOT, 'public', r.video))) {
      errors.push(`signs: video ${r.video} is missing (run npm run assets:nzsl)`);
    }
    signs[sid] ??= {
      gloss: r.gloss,
      maori: r.maori,
      hint: r.hint,
      usage: r.usage,
      video: r.video,
      remoteVideo: r.remoteVideo,
      image: r.image,
      source: r.source,
    };
    (links[r.itemId] ??= [])[r.rank] = sid;
  }
  if (staleLinks) warnings.push(`${staleLinks} NZSL links point at items that no longer exist (re-run npm run assets:nzsl)`);
  for (const k of Object.keys(links)) links[k] = links[k].filter(Boolean);

  const dataset = {
    version: 1,
    categories: outCategories,
    items,
    boards,
    quickGroups: quick.groups,
    predictions: seeds,
  };
  const signPack = {
    id: 'nzsl',
    signLanguage: 'nzsl',
    name: 'New Zealand Sign Language',
    source: signMap.source,
    attribution: signMap.attribution,
    license: signMap.license,
    signs,
    links,
  };
  return {
    dataset,
    signPack,
    errors,
    warnings,
    symbolQueries: items.map((i) => ({ id: i.id, item: i, symq: i.symq })),
    categoriesSrc: categories,
  };
}
