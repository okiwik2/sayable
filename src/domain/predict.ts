// Local next-word suggestions. Runs entirely on the device: starter word links from the data files,
// plus what this user has said before (only if they allow learning). Suggestions are never added
// to the message unless the user picks one.
import type { EnglishFormKey, Lang, Token, VocabItem } from './types';
import { inflect } from './inflect';

export interface Suggestion {
  itemId: string;
  form?: EnglishFormKey;
  text: string;
  source: 'learned' | 'starter' | 'pattern';
}

/** from item id -> next item id -> count. "^" is the start of a message. */
export type Bigrams = Record<string, Record<string, number>>;
export const START = '^';

export interface PredictInput {
  lang: Lang;
  tokens: Token[];
  cursor: number | null;
  items: Map<string, VocabItem>;
  seeds: Record<string, string[]>;
  learned?: Bigrams;
  traditional?: boolean;
  limit?: number;
}

const STARTERS: Record<Lang, string[]> = {
  en: ['i', 'you', 'can', 'what', 'where', 'please', 'my', 'it', 'we', 'help', 'is', 'do'],
  zh: ['i', 'you', 'zh-yao', 'what', 'where', 'please', 'we', 'he', 'she', 'zh-keyi', 'zh-zhege', 'zh-buyao'],
};

/** Fallbacks by part of speech when there is nothing more specific. */
const PATTERNS: Record<Lang, Partial<Record<string, string[]>>> = {
  en: {
    pron: ['want', 'need', 'like', 'feel', 'can', 'have', 'dont', 'go', 'think', 'know'],
    verb: ['to', 'it', 'that', 'a', 'the', 'more', 'you', 'me', 'some', 'please'],
    det: ['food', 'drink-noun', 'toy', 'book', 'ball', 'tv', 'phone', 'bag'],
    adj: ['and', 'because', 'too', 'now', 'please', 'but'],
    noun: ['please', 'and', 'is', 'now', 'because', 'too', 'later'],
    q: ['is', 'are', 'do', 'can', 'you', 'we', 'will'],
    prep: ['the', 'my', 'you', 'me', 'it', 'here', 'there'],
    conj: ['i', 'you', 'it', 'we', 'they', 'then'],
    adv: ['good', 'more', 'now', 'please', 'want', 'go'],
    interj: ['i', 'you', 'please', 'thank-you', 'can'],
  },
  zh: {
    pron: ['zh-yao', 'zh-xiang', 'like', 'zh-you', 'zh-shi', 'zh-buyao', 'very', 'go', 'eat', 'zh-zai'],
    verb: ['zh-zhege', 'zh-nage', 'zh-le', 'zh-ma', 'what', 'zh-yidian', 'zh-yixia'],
    adj: ['zh-le', 'zh-ma', 'zh-ne', 'zh-de'],
    noun: ['zh-le', 'zh-ma', 'zh-de', 'zh-zai', 'zh-shi'],
    adv: ['good', 'zh-yao', 'zh-xiang', 'like', 'go', 'happy'],
    particle: ['i', 'you', 'zh-hao'],
    q: ['zh-ne', 'zh-ma', 'zh-shi', 'zh-you'],
    measure: ['food', 'water', 'book', 'apple'],
  },
};

/** Find the item behind a typed word, so predictions also work after keyboard input. */
function itemIdFor(token: Token, items: Map<string, VocabItem>): string | undefined {
  if (token.itemId) return token.itemId;
  const text = token.text.toLowerCase();
  for (const item of items.values()) {
    if (token.lang === 'en' && item.forms.en?.text.toLowerCase() === text) return item.id;
    if (token.lang === 'zh' && (item.forms.zh?.hans === token.text || item.forms.zh?.hant === token.text)) return item.id;
  }
  return undefined;
}

function textFor(item: VocabItem, lang: Lang, form: EnglishFormKey | undefined, traditional: boolean): string | undefined {
  if (lang === 'zh') return traditional ? item.forms.zh?.hant : item.forms.zh?.hans;
  const en = item.forms.en?.text;
  if (!en) return undefined;
  return form ? inflect(en, form, item.grammar?.irregular) : en;
}

export function predictNext(input: PredictInput): Suggestion[] {
  const { lang, tokens, items, seeds, learned = {}, traditional = false, limit = 8 } = input;
  const at = input.cursor ?? tokens.length;
  const prev = tokens[at - 1];
  const prevId = prev ? itemIdFor(prev, items) : START;
  const scores = new Map<string, { score: number; source: Suggestion['source'] }>();

  const add = (key: string, score: number, source: Suggestion['source']) => {
    const current = scores.get(key);
    if (!current || current.score < score) scores.set(key, { score, source });
    else current.score += score * 0.25;
  };

  if (prevId) {
    const counts = learned[`${lang}:${prevId}`] ?? {};
    for (const [next, count] of Object.entries(counts)) add(next, 3 + Math.log2(1 + count), 'learned');
    const seedList = prevId === START ? STARTERS[lang] : seeds[prevId] ?? [];
    seedList.forEach((next, i) => add(next, 2 - i * 0.05, prevId === START ? 'pattern' : 'starter'));
  }
  const prevPos = prev?.pos ?? (prevId && prevId !== START ? items.get(prevId)?.pos : undefined);
  if (prevPos) (PATTERNS[lang][prevPos] ?? []).forEach((next, i) => add(next, 1 - i * 0.05, 'pattern'));

  const out: Suggestion[] = [];
  const seenText = new Set<string>();
  for (const [key, { source }] of [...scores.entries()].sort((a, b) => b[1].score - a[1].score)) {
    const [id, form] = key.split('+') as [string, EnglishFormKey | undefined];
    if (id === prevId) continue;
    const item = items.get(id);
    if (!item) continue;
    const text = textFor(item, lang, form, traditional);
    if (!text || seenText.has(text)) continue;
    seenText.add(text);
    out.push({ itemId: id, form, text, source });
    if (out.length >= limit) break;
  }
  return out;
}

/** Ready-made phrases that contain the last word, e.g. "help" -> "Can you help me, please?" */
export function phrasesWith(token: Token | undefined, items: Map<string, VocabItem>, limit = 4): VocabItem[] {
  if (!token || token.kind === 'phrase') return [];
  const word = token.text.toLowerCase();
  if (word.length < 2 && token.lang === 'en') return [];
  const found: VocabItem[] = [];
  for (const item of items.values()) {
    if (item.kind !== 'phrase') continue;
    if (token.lang === 'en') {
      const text = item.forms.en?.text.toLowerCase();
      if (text && new RegExp(`(^|[^a-z'])${escapeRegExp(word)}([^a-z']|$)`).test(text)) found.push(item);
    } else {
      const zh = item.forms.zh;
      if (zh && (zh.hans.includes(token.text) || zh.hant.includes(token.text)) && [...token.text].length > 1) found.push(item);
    }
  }
  return found.sort((a, b) => b.frequency - a.frequency).slice(0, limit);
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Update learned word pairs from a spoken message. */
export function learn(bigrams: Bigrams, tokens: Token[], items: Map<string, VocabItem>): Bigrams {
  const next: Bigrams = { ...bigrams };
  let prev = START;
  for (const t of tokens) {
    const id = itemIdFor(t, items);
    if (!id) {
      prev = START;
      continue;
    }
    const key = `${t.lang}:${prev}`;
    const target = t.form ? `${id}+${t.form}` : id;
    next[key] = { ...(next[key] ?? {}), [target]: (next[key]?.[target] ?? 0) + 1 };
    prev = id;
  }
  return next;
}
