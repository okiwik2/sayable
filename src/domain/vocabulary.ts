// Combines the built-in vocabulary with each person's own changes: custom words, photos,
// renamed or hidden items, favourites and chosen signs. Built-in data is never modified.
import type { Board, Category, Dataset, Lang, SymbolRef, VocabItem } from './types';

export interface ItemOverride {
  itemId: string;
  hidden?: boolean;
  label?: Partial<Record<Lang, string>>;
  say?: Partial<Record<Lang, string>>;
  /** A photo or picture the user added, stored on the device. */
  imageId?: string;
  /** A different symbol, or null for "no symbol". */
  symbol?: SymbolRef | null;
  favourite?: boolean;
  /** Keep this tile where it is even when adaptive ordering is on. */
  locked?: boolean;
  notes?: string;
  /** Chosen sign id, or null for "no sign". */
  signChoice?: string | null;
  signReviewed?: boolean;
  keywords?: string[];
  extraCategories?: string[];
}

export interface CategoryPrefs {
  order: string[];
  hidden: string[];
  favourites: string[];
  /** Custom order of items inside a category */
  itemOrder: Record<string, string[]>;
}

export const emptyCategoryPrefs = (): CategoryPrefs => ({ order: [], hidden: [], favourites: [], itemOrder: {} });

export interface Vocabulary {
  items: Map<string, VocabItem>;
  /** Original position of each item, used as the default order. */
  order: Map<string, number>;
  categories: Map<string, Category>;
  overrides: Map<string, ItemOverride>;
}

export function applyOverride(item: VocabItem, ov: ItemOverride | undefined): VocabItem {
  if (!ov) return item;
  const out: VocabItem = { ...item, forms: { ...item.forms } };
  if (ov.label?.en && out.forms.en) out.forms.en = { ...out.forms.en, text: ov.label.en };
  if (ov.label?.en && !out.forms.en) out.forms.en = { text: ov.label.en };
  if (ov.label?.zh && out.forms.zh) out.forms.zh = { ...out.forms.zh, hans: ov.label.zh, hant: ov.label.zh };
  if (ov.say?.en && out.forms.en) out.forms.en = { ...out.forms.en, say: ov.say.en };
  if (ov.say?.zh && out.forms.zh) out.forms.zh = { ...out.forms.zh, say: ov.say.zh };
  if (ov.imageId) out.symbol = { set: 'custom', id: ov.imageId };
  else if (ov.symbol === null) delete out.symbol;
  else if (ov.symbol) out.symbol = ov.symbol;
  if (ov.keywords?.length) out.keywords = [...(item.keywords ?? []), ...ov.keywords];
  if (ov.extraCategories?.length) out.categories = [...new Set([...item.categories, ...ov.extraCategories])];
  if (ov.notes) out.notes = ov.notes;
  return out;
}

export function buildVocabulary(
  dataset: Dataset,
  customItems: VocabItem[],
  overrides: ItemOverride[],
  customCategories: Category[] = [],
): Vocabulary {
  const ovMap = new Map(overrides.map((o) => [o.itemId, o]));
  const items = new Map<string, VocabItem>();
  const order = new Map<string, number>();
  let i = 0;
  for (const item of dataset.items) {
    items.set(item.id, applyOverride(item, ovMap.get(item.id)));
    order.set(item.id, i++);
  }
  for (const item of customItems) {
    items.set(item.id, applyOverride({ ...item, custom: true }, ovMap.get(item.id)));
    order.set(item.id, i++);
  }
  const categories = new Map<string, Category>();
  for (const c of [...dataset.categories, ...customCategories]) categories.set(c.id, c);
  return { items, order, categories, overrides: ovMap };
}

export function isHidden(vocab: Vocabulary, id: string): boolean {
  const item = vocab.items.get(id);
  if (item?.essential) return false; // essential words can never be hidden
  return !!vocab.overrides.get(id)?.hidden;
}

export function hasLang(item: VocabItem, langs: Lang[]): boolean {
  return langs.some((l) => !!item.forms[l]);
}

export function childCategories(vocab: Vocabulary, parent: string | null, prefs: CategoryPrefs, showHidden = false): Category[] {
  const list = [...vocab.categories.values()].filter((c) => c.parent === parent && (showHidden || !prefs.hidden.includes(c.id)));
  const pos = (id: string) => {
    const idx = prefs.order.indexOf(id);
    return idx === -1 ? 1000 + [...vocab.categories.keys()].indexOf(id) : idx;
  };
  return list.sort((a, b) => pos(a.id) - pos(b.id));
}

export interface UsageStat {
  count: number;
  last: number;
}

/** Score used only when adaptive ordering is switched on. Core words never move. */
export function adaptiveScore(item: VocabItem, usage: UsageStat | undefined, favourite: boolean, now = Date.now()): number {
  const recency = usage ? Math.max(0, 1 - (now - usage.last) / (14 * 86400000)) : 0;
  return item.frequency * 2 + Math.log2(1 + (usage?.count ?? 0)) + recency + (favourite ? 1.5 : 0);
}

export function itemsInCategory(
  vocab: Vocabulary,
  categoryId: string,
  langs: Lang[],
  prefs: CategoryPrefs,
  opts: { adaptive?: boolean; usage?: Map<string, UsageStat>; includeHidden?: boolean } = {},
): VocabItem[] {
  const list = [...vocab.items.values()].filter(
    (item) =>
      item.categories.includes(categoryId) &&
      !item.quick &&
      hasLang(item, langs) &&
      (opts.includeHidden || !isHidden(vocab, item.id)),
  );
  const custom = prefs.itemOrder[categoryId];
  const basePos = (id: string) => {
    if (custom) {
      const idx = custom.indexOf(id);
      if (idx !== -1) return idx;
      return custom.length + (vocab.order.get(id) ?? 0);
    }
    return vocab.order.get(id) ?? 0;
  };
  list.sort((a, b) => basePos(a.id) - basePos(b.id));
  if (!opts.adaptive) return dedupeByLabel(list, langs);

  // Adaptive: locked items keep their slot, the rest are sorted by score into the free slots.
  const locked = new Set(list.filter((x) => vocab.overrides.get(x.id)?.locked || x.core).map((x) => x.id));
  const movable = list
    .filter((x) => !locked.has(x.id))
    .sort(
      (a, b) =>
        adaptiveScore(b, opts.usage?.get(b.id), !!vocab.overrides.get(b.id)?.favourite) -
        adaptiveScore(a, opts.usage?.get(a.id), !!vocab.overrides.get(a.id)?.favourite),
    );
  const out = list.map((x) => (locked.has(x.id) ? x : movable.shift()!));
  return dedupeByLabel(out, langs);
}

/** In a single-language view, do not show two tiles that look identical. */
function dedupeByLabel(list: VocabItem[], langs: Lang[]): VocabItem[] {
  if (langs.length !== 1) return list;
  const lang = langs[0]!;
  const seen = new Set<string>();
  return list.filter((item) => {
    const label = lang === 'en' ? item.forms.en?.text.toLowerCase() : item.forms.zh?.hans;
    if (!label) return false;
    if (seen.has(label)) return false;
    seen.add(label);
    return true;
  });
}

/** Pick the core board for a language and size, preferring the user's edited copy. */
export function coreBoardId(lang: Lang, level: string): string {
  return `core-${lang}-${level}`;
}

export function resolveBoard(id: string, builtIn: Board[], userBoards: Board[]): Board | undefined {
  return userBoards.find((b) => b.id === id) ?? builtIn.find((b) => b.id === id);
}
