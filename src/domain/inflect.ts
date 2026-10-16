// English word forms (wants, wanted, wanting, apples...). Regular rules plus a table of common irregulars.
// Multi-word verbs ("wake up") change their first word only.
import type { EnglishFormKey, VocabItem } from './types';

const IRREGULAR_VERBS: Record<string, { past: string; pp: string; s?: string }> = {
  be: { past: 'was', pp: 'been', s: 'is' },
  have: { past: 'had', pp: 'had', s: 'has' },
  do: { past: 'did', pp: 'done', s: 'does' },
  go: { past: 'went', pp: 'gone', s: 'goes' },
  come: { past: 'came', pp: 'come' },
  get: { past: 'got', pp: 'got' },
  give: { past: 'gave', pp: 'given' },
  take: { past: 'took', pp: 'taken' },
  make: { past: 'made', pp: 'made' },
  put: { past: 'put', pp: 'put' },
  say: { past: 'said', pp: 'said' },
  see: { past: 'saw', pp: 'seen' },
  tell: { past: 'told', pp: 'told' },
  think: { past: 'thought', pp: 'thought' },
  know: { past: 'knew', pp: 'known' },
  feel: { past: 'felt', pp: 'felt' },
  eat: { past: 'ate', pp: 'eaten' },
  drink: { past: 'drank', pp: 'drunk' },
  sleep: { past: 'slept', pp: 'slept' },
  wake: { past: 'woke', pp: 'woken' },
  run: { past: 'ran', pp: 'run' },
  sit: { past: 'sat', pp: 'sat' },
  stand: { past: 'stood', pp: 'stood' },
  leave: { past: 'left', pp: 'left' },
  find: { past: 'found', pp: 'found' },
  bring: { past: 'brought', pp: 'brought' },
  buy: { past: 'bought', pp: 'bought' },
  write: { past: 'wrote', pp: 'written' },
  read: { past: 'read', pp: 'read' },
  hear: { past: 'heard', pp: 'heard' },
  speak: { past: 'spoke', pp: 'spoken' },
  forget: { past: 'forgot', pp: 'forgotten' },
  understand: { past: 'understood', pp: 'understood' },
  hurt: { past: 'hurt', pp: 'hurt' },
  cut: { past: 'cut', pp: 'cut' },
  let: { past: 'let', pp: 'let' },
  hit: { past: 'hit', pp: 'hit' },
  lose: { past: 'lost', pp: 'lost' },
  win: { past: 'won', pp: 'won' },
  meet: { past: 'met', pp: 'met' },
  pay: { past: 'paid', pp: 'paid' },
  send: { past: 'sent', pp: 'sent' },
  keep: { past: 'kept', pp: 'kept' },
  hold: { past: 'held', pp: 'held' },
  fall: { past: 'fell', pp: 'fallen' },
  ride: { past: 'rode', pp: 'ridden' },
  drive: { past: 'drove', pp: 'driven' },
  swim: { past: 'swam', pp: 'swum' },
  sing: { past: 'sang', pp: 'sung' },
  draw: { past: 'drew', pp: 'drawn' },
  build: { past: 'built', pp: 'built' },
  throw: { past: 'threw', pp: 'thrown' },
  catch: { past: 'caught', pp: 'caught' },
  fight: { past: 'fought', pp: 'fought' },
  choose: { past: 'chose', pp: 'chosen' },
  break: { past: 'broke', pp: 'broken' },
  begin: { past: 'began', pp: 'begun' },
  mean: { past: 'meant', pp: 'meant' },
  lie: { past: 'lay', pp: 'lain' },
  feed: { past: 'fed', pp: 'fed' },
  hang: { past: 'hung', pp: 'hung' },
  show: { past: 'showed', pp: 'shown' },
  learn: { past: 'learned', pp: 'learned' },
  can: { past: 'could', pp: 'could', s: 'can' },
  will: { past: 'would', pp: 'would', s: 'will' },
};

const IRREGULAR_PLURALS: Record<string, string> = {
  child: 'children', person: 'people', man: 'men', woman: 'women', foot: 'feet', tooth: 'teeth',
  mouse: 'mice', sheep: 'sheep', fish: 'fish', knife: 'knives', leaf: 'leaves', wife: 'wives',
};

const VOWELS = 'aeiou';
const isConsonant = (ch: string | undefined) => !!ch && /[a-z]/.test(ch) && !VOWELS.includes(ch);

/** Should the final consonant double? (stop -> stopping). Short CVC words only. */
function doubles(word: string): boolean {
  if (word.length < 3 || word.length > 4) return false;
  const [a, b, c] = word.slice(-3);
  return isConsonant(a) && VOWELS.includes(b!) && isConsonant(c) && !'wxy'.includes(c!);
}

function thirdPerson(w: string): string {
  if (IRREGULAR_VERBS[w]?.s) return IRREGULAR_VERBS[w]!.s!;
  if (/(s|sh|ch|x|z|o)$/.test(w)) return w + 'es';
  if (/[^aeiou]y$/.test(w)) return w.slice(0, -1) + 'ies';
  return w + 's';
}

function pastTense(w: string): string {
  if (IRREGULAR_VERBS[w]) return IRREGULAR_VERBS[w]!.past;
  if (w.endsWith('e')) return w + 'd';
  if (/[^aeiou]y$/.test(w)) return w.slice(0, -1) + 'ied';
  if (doubles(w)) return w + w.at(-1) + 'ed';
  return w + 'ed';
}

function pastParticiple(w: string): string {
  if (IRREGULAR_VERBS[w]) return IRREGULAR_VERBS[w]!.pp;
  return pastTense(w);
}

function presentParticiple(w: string): string {
  if (w === 'be') return 'being';
  if (w === 'lie') return 'lying';
  if (/ie$/.test(w)) return w.slice(0, -2) + 'ying';
  if (/[^e]e$/.test(w) && w !== 'see') return w.slice(0, -1) + 'ing';
  if (doubles(w)) return w + w.at(-1) + 'ing';
  return w + 'ing';
}

export function pluralize(noun: string): string {
  const lower = noun.toLowerCase();
  if (IRREGULAR_PLURALS[lower]) return IRREGULAR_PLURALS[lower]!;
  if (/(s|sh|ch|x|z)$/.test(lower)) return noun + 'es';
  if (/[^aeiou]y$/.test(lower)) return noun.slice(0, -1) + 'ies';
  return noun + 's';
}

const FORM_FNS: Record<Exclude<EnglishFormKey, 'pl'>, (w: string) => string> = {
  s: thirdPerson,
  past: pastTense,
  pp: pastParticiple,
  ing: presentParticiple,
};

/** Apply a form to an English word or multi-word verb. */
export function inflect(text: string, form: EnglishFormKey, irregular?: Partial<Record<EnglishFormKey, string>>): string {
  if (irregular?.[form]) return irregular[form]!;
  if (form === 'pl') return pluralize(text);
  const [first, ...rest] = text.split(' ');
  const changed = FORM_FNS[form](first!.toLowerCase());
  return [changed, ...rest].join(' ');
}

/** Which forms make sense for this item, with their text. */
export function formsFor(item: VocabItem): { form: EnglishFormKey; text: string }[] {
  const en = item.forms.en;
  if (!en || item.kind === 'phrase') return [];
  const irr = item.grammar?.irregular;
  if (item.pos === 'verb' && !item.grammar?.modal && !/'|n't/.test(en.text)) {
    return (['s', 'past', 'ing', 'pp'] as const)
      .map((form) => ({ form, text: inflect(en.text, form, irr) }))
      .filter((f, i, all) => f.text !== en.text && all.findIndex((x) => x.text === f.text) === i);
  }
  if (item.pos === 'noun' && !item.grammar?.uncountable && /^[a-z]/.test(en.text) && !/s$/.test(en.text)) {
    return [{ form: 'pl', text: inflect(en.text, 'pl', irr) }];
  }
  return [];
}

export const FORM_LABELS: Record<EnglishFormKey, string> = {
  s: 'he/she/it',
  past: 'past',
  pp: 'has/have …',
  ing: '-ing',
  pl: 'more than one',
};
