// Fast local search across words, phrases, synonyms, categories, Chinese characters and pinyin.
// Pinyin can be typed with tone marks (xǐhuan), tone numbers (xi3huan1) or no tones (xihuan).
import type { Category, Lang, VocabItem } from './types';

const TONE_MAP: Record<string, string> = {
  ā: 'a', á: 'a', ǎ: 'a', à: 'a', ē: 'e', é: 'e', ě: 'e', è: 'e', ī: 'i', í: 'i', ǐ: 'i', ì: 'i',
  ō: 'o', ó: 'o', ǒ: 'o', ò: 'o', ū: 'u', ú: 'u', ǔ: 'u', ù: 'u', ǖ: 'v', ǘ: 'v', ǚ: 'v', ǜ: 'v', ü: 'v',
};

export function stripTones(s: string): string {
  return s.normalize('NFC').replace(/[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü]/g, (c) => TONE_MAP[c] ?? c);
}

export function normalizeLatin(s: string): string {
  return stripTones(s.toLowerCase()).replace(/[’']/g, '').replace(/\s+/g, ' ').trim();
}

const hasHan = (s: string) => /[㐀-鿿]/.test(s);

interface Entry {
  item: VocabItem;
  en: string[];
  enWords: string[];
  zh: string[];
  pinyinPlain: string;
  pinyinNum: string;
  extra: string[];
  cats: string[];
}

export interface SearchIndex {
  entries: Entry[];
}

export function buildIndex(items: Iterable<VocabItem>, categories: Map<string, Category>): SearchIndex {
  const entries: Entry[] = [];
  for (const item of items) {
    const en = item.forms.en ? [item.forms.en.text, ...(item.forms.en.alt ?? [])].map(normalizeLatin) : [];
    const zhForm = item.forms.zh;
    const zh = zhForm ? [zhForm.hans, zhForm.hant, ...(zhForm.alt ?? []).flatMap((a) => [a.hans, a.hant])] : [];
    const extra = [...(item.keywords ?? []), item.forms.en?.say ?? '', zhForm?.gloss ?? ''].filter(Boolean).map(normalizeLatin);
    const cats = item.categories.flatMap((id) => {
      const c = categories.get(id);
      return c ? [normalizeLatin(c.name.en), c.name.zh] : [];
    });
    entries.push({
      item,
      en,
      enWords: en.flatMap((e) => e.split(/[^a-z0-9]+/)).filter(Boolean),
      zh,
      pinyinPlain: zhForm ? [zhForm.pinyinPlain, ...(zhForm.alt ?? []).map((a) => a.pinyinPlain)].join(' ') : '',
      pinyinNum: zhForm ? [zhForm.pinyinNum.replace(/\s+/g, ''), ...(zhForm.alt ?? []).map((a) => a.pinyinNum.replace(/\s+/g, ''))].join(' ') : '',
      extra,
      cats,
    });
  }
  return { entries };
}

export interface SearchOptions {
  langs: Lang[];
  limit?: number;
  /** Extra score per item id, e.g. from usage and favourites. */
  boost?: (id: string) => number;
  /** Hide items that should not be shown (hidden by the user). */
  include?: (item: VocabItem) => boolean;
}

export interface SearchResult {
  item: VocabItem;
  score: number;
}

function scoreLatin(q: string, values: string[], exact: number, prefix: number, contains: number): number {
  let best = 0;
  for (const v of values) {
    if (v === q) best = Math.max(best, exact);
    else if (v.startsWith(q)) best = Math.max(best, prefix - Math.min(10, v.length - q.length));
    else if (contains && v.includes(q)) best = Math.max(best, contains);
  }
  return best;
}

export function search(index: SearchIndex, rawQuery: string, opts: SearchOptions): SearchResult[] {
  const query = rawQuery.trim();
  if (!query) return [];
  const q = normalizeLatin(query);
  const qCompact = q.replace(/\s+/g, '');
  const toneNumbers = /[a-z][1-5]/.test(qCompact);
  const han = hasHan(query);
  const results: SearchResult[] = [];

  for (const e of index.entries) {
    const { item } = e;
    if (opts.include && !opts.include(item)) continue;
    const usable = opts.langs.some((l) => item.forms[l]);
    if (!usable) continue;
    let score = 0;
    if (han) {
      for (const z of e.zh) {
        if (z === query) score = Math.max(score, 100);
        else if (z.startsWith(query)) score = Math.max(score, 75);
        else if (z.includes(query)) score = Math.max(score, 45);
      }
    } else {
      if (opts.langs.includes('en') && item.forms.en) {
        score = Math.max(score, scoreLatin(q, e.en, 100, 75, 30));
        if (e.enWords.includes(q)) score = Math.max(score, 60);
        else if (e.enWords.some((w) => w.startsWith(q))) score = Math.max(score, 50);
      }
      if (item.forms.zh && opts.langs.includes('zh')) {
        if (toneNumbers) {
          const nums = e.pinyinNum.split(' ');
          // Neutral tone may be typed as 5 or 0, or left out.
          const qNum = qCompact.replace(/0/g, '5');
          if (nums.includes(qNum) || nums.some((n) => n.replace(/5/g, '') === qNum)) score = Math.max(score, 95);
          else if (nums.some((n) => n.startsWith(qNum))) score = Math.max(score, 70);
        } else {
          const plains = e.pinyinPlain.split(' ');
          if (plains.includes(qCompact)) score = Math.max(score, 90);
          else if (qCompact.length >= 2 && plains.some((p) => p.startsWith(qCompact))) score = Math.max(score, 65);
        }
      }
      score = Math.max(score, scoreLatin(q, e.extra, 85, 45, 25));
      // English meaning helps people find Chinese-only words (e.g. "question" -> 吗).
    }
    if (!score) {
      if (e.cats.some((c) => c === q || c === query)) score = 22;
      else if (q.length >= 3 && e.cats.some((c) => c.startsWith(q))) score = 15;
    }
    if (!score) continue;
    score += item.frequency * 10 + (item.kind === 'word' ? 2 : 0) + (opts.boost?.(item.id) ?? 0);
    results.push({ item, score });
  }
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, opts.limit ?? 80);
}

export function searchCategories(categories: Iterable<Category>, rawQuery: string): Category[] {
  const q = normalizeLatin(rawQuery);
  if (!q) return [];
  return [...categories].filter((c) => normalizeLatin(c.name.en).includes(q) || c.name.zh.includes(rawQuery.trim()));
}
