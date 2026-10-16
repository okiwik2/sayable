// Core data types shared across the app. Kept free of UI and storage details.

/** Languages the vocabulary and speech support. Add new codes here (and in the data files) to add a language. */
export type Lang = 'en' | 'zh';
export const LANGS: Lang[] = ['en', 'zh'];

export type PartOfSpeech =
  | 'noun' | 'verb' | 'adj' | 'adv' | 'pron' | 'det' | 'prep' | 'conj'
  | 'interj' | 'num' | 'q' | 'particle' | 'measure' | 'phrase';

export type EnglishFormKey = 's' | 'past' | 'pp' | 'ing' | 'pl';

export interface EnglishForm {
  text: string;
  alt?: string[];
  /** How to pronounce it, if different from the written label. */
  say?: string;
}

export interface ChineseVariant {
  hans: string;
  hant: string;
  pinyin: string;
  pinyinNum: string;
  pinyinPlain: string;
}

export interface ChineseForm extends ChineseVariant {
  alt?: ChineseVariant[];
  /** English meaning, mainly for Chinese-only grammar words. */
  gloss?: string;
  say?: string;
}

export interface SymbolRef {
  set: 'arasaac' | 'custom';
  /** ARASAAC pictogram number, or custom image id */
  id: number | string;
}

export interface Grammar {
  person?: 1 | 2 | 3;
  modal?: boolean;
  uncountable?: boolean;
  irregular?: Partial<Record<EnglishFormKey, string>>;
}

export interface VocabItem {
  id: string;
  kind: 'word' | 'phrase';
  pos: PartOfSpeech;
  category: string;
  categories: string[];
  forms: { en?: EnglishForm; zh?: ChineseForm };
  symbol?: SymbolRef;
  keywords?: string[];
  grammar?: Grammar;
  /** 0..1, higher = more common. Core words are highest. */
  frequency: number;
  core?: boolean;
  /** Refusal, safety and other words that cannot be removed. */
  essential?: boolean;
  quick?: boolean;
  /** Set on items the user (or a caregiver) created. */
  custom?: boolean;
  notes?: string;
}

export interface Category {
  id: string;
  parent: string | null;
  name: Record<Lang, string>;
  hue: Hue;
  symbol?: SymbolRef;
  custom?: boolean;
}

export type Hue = 'yellow' | 'green' | 'blue' | 'orange' | 'pink' | 'purple' | 'red' | 'teal' | 'brown' | 'grey';

export type CoreLevel = 'starter' | 'standard' | 'extended';

export interface Board {
  id: string;
  name: Record<Lang, string>;
  kind: 'core' | 'context' | 'custom';
  /** Core boards are built for one language; context and custom boards work in any. */
  lang: Lang | null;
  level: CoreLevel | null;
  cols: number;
  /** Item ids in reading order; null = empty cell. */
  cells: (string | null)[];
  locked?: boolean;
  updatedAt?: number;
}

export interface QuickGroup {
  id: string;
  name: Record<Lang, string>;
  items: string[];
}

export type SignLanguageId = 'nzsl' | 'asl' | 'bsl' | 'none';

/** One sign from a dictionary pack. */
export interface SignEntry {
  gloss: string;
  maori?: string;
  hint?: string;
  usage?: string;
  /** Video bundled with the app (works offline once saved), relative to the app root. */
  video?: string;
  /** Video on the dictionary's own server (needs internet). */
  remoteVideo?: string;
  image?: string;
  source: string;
}

/** A sign-language content pack: signs plus which vocabulary items they are linked to. */
export interface SignPack {
  id: string;
  signLanguage: SignLanguageId;
  name: string;
  source?: string;
  attribution: string;
  license: string;
  signs: Record<string, SignEntry>;
  /** item id -> sign ids, best match by English word first */
  links: Record<string, string[]>;
}

/** A sign resource as shown in the app: from a pack, or added by the user. */
export interface SignResource {
  id: string;
  itemId: string;
  signLanguage: SignLanguageId;
  /** Region or dialect, when known. */
  region?: string;
  type: 'video' | 'image' | 'link';
  gloss: string;
  maori?: string;
  hint?: string;
  usage?: string;
  video?: string;
  remoteVideo?: string;
  image?: string;
  /** For user-added resources stored on the device. */
  blobId?: string;
  url?: string;
  source?: string;
  attribution?: string;
  license?: string;
  /** 'dictionary-match' = matched by English word; 'reviewed' = a person confirmed it; 'custom' = added by the user */
  verification: 'dictionary-match' | 'reviewed' | 'custom';
  rank: number;
  notes?: string;
}

export interface Dataset {
  version: number;
  categories: Category[];
  items: VocabItem[];
  boards: Board[];
  quickGroups: QuickGroup[];
  predictions: Record<Lang, Record<string, string[]>>;
}

/** One piece of the message being built. The sentence shown and spoken is derived from these. */
export interface Token {
  id: string;
  itemId?: string;
  text: string;
  lang: Lang;
  /** Pronunciation override for speech. */
  say?: string;
  pos?: PartOfSpeech;
  form?: EnglishFormKey;
  kind: 'word' | 'phrase' | 'typed';
}

export interface MessageState {
  tokens: Token[];
  /** Where the next word goes: index in tokens, or null for "at the end". */
  cursor: number | null;
}

export interface SavedMessage {
  id: string;
  profileId: string;
  text: string;
  tokens: Token[];
  lang: Lang | 'mixed';
  createdAt: number;
  usedAt?: number;
  uses: number;
  favourite?: boolean;
  label?: string;
}

export interface HistoryEntry {
  id: string;
  profileId: string;
  text: string;
  tokens: Token[];
  at: number;
}
