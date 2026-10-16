import { dataset } from '../../src/data/dataset';
import { buildVocabulary } from '../../src/domain/vocabulary';
import { tokenFor } from '../../src/domain/sentence';
import type { Lang, Token } from '../../src/domain/types';

export const vocab = buildVocabulary(dataset, [], []);
export const lookup = (id: string) => vocab.items.get(id);

/** Build tokens from item ids, e.g. toks('en', 'i', 'want', 'water'). */
export function toks(lang: Lang, ...ids: string[]): Token[] {
  return ids.map((id) => {
    const item = vocab.items.get(id);
    if (!item) throw new Error(`No item ${id}`);
    const t = tokenFor(item, lang);
    if (!t) throw new Error(`Item ${id} has no ${lang} form`);
    return t;
  });
}

export const texts = (tokens: Token[]) => tokens.map((t) => t.text);
