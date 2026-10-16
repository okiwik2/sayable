// Optional grammar help. It never changes the message by itself: it offers a suggestion the
// user can take or ignore. Rules are deliberately few and conservative, and each language has its own.
import type { Token, VocabItem } from './types';
import { newTokenId } from './sentence';
import { inflect } from './inflect';

type Lookup = (id: string) => VocabItem | undefined;

const lower = (t: Token) => t.text.toLowerCase();
const mk = (text: string, lang: Token['lang'], itemId?: string, pos?: Token['pos']): Token => ({
  id: newTokenId(),
  text,
  lang,
  itemId,
  pos,
  kind: 'word',
});

// ---------------- English ----------------

const OBJECT_TO_SUBJECT: Record<string, string> = { me: 'I', him: 'he', her: 'she', us: 'we', them: 'they' };
const SUBJECTS = new Set(['i', 'you', 'he', 'she', 'it', 'we', 'they', 'this', 'that']);
const THIRD = new Set(['he', 'she', 'it', 'this', 'that']);
const CLAUSE_START = new Set(['and', 'but', 'because', 'so', 'if', 'then', 'when', 'or']);
const BE_FORMS = new Set(['is', 'are', 'am', 'be']);
const TO_VERBS = new Set(['want', 'wants', 'need', 'needs', 'like', 'likes', 'love', 'loves', 'try', 'tries', 'forget', 'remember', 'hope', 'decide', 'learn', 'plan', 'have', 'has', 'wanted', 'needed', 'going']);
const MOTION = new Set(['go', 'goes', 'went', 'going', 'come', 'comes', 'came', 'walk', 'run', 'drive', 'ride']);
const NO_TO_PLACES = new Set(['home-place', 'outside-place', 'inside-place', 'upstairs', 'downstairs', 'here', 'there', 'home', 'outside', 'inside']);
const NO_ARTICLE_PLACES = new Set(['school', 'work-place', 'church', 'bed', 'hospital', 'town', 'class', 'new-zealand', 'china', 'auckland', 'temple', 'mosque', 'marae']);
const PLACE_CATEGORIES = new Set(['places', 'home', 'school', 'community', 'travel', 'work', 'health']);
const ARTICLE_VERBS = new Set(['want', 'wants', 'need', 'needs', 'have', 'has', 'get', 'got', 'see', 'saw', 'had']);
const NO_ARTICLE_CATEGORIES = new Set(['people', 'time', 'numbers', 'colours', 'places', 'feelings', 'school', 'sports', 'hobbies', 'culture', 'ideas']);
const DETERMINERS = new Set(['a', 'an', 'the', 'my', 'your', 'his', 'her', 'our', 'their', 'this', 'that', 'some', 'any', 'more', 'another', 'one', 'no', 'every', 'each']);

function startsWithVowelSound(word: string): boolean {
  const w = word.toLowerCase();
  if (/^(hour|honest|honour|honor|heir)/.test(w)) return true;
  if (/^(uni|use|usu|uti|one|once|eu|ewe|u[bcfhjkqrstn][aeiou])/.test(w)) return false;
  return /^[aeiou]/.test(w);
}

function isVerb(t: Token | undefined, lookup: Lookup): boolean {
  if (!t || t.kind !== 'word') return false;
  if (t.pos === 'verb') return !lookup(t.itemId ?? '')?.grammar?.modal && !BE_FORMS.has(lower(t)) && !/n't$/.test(t.text);
  return false;
}

function isAdjective(t: Token | undefined, lookup: Lookup): boolean {
  if (!t || t.kind !== 'word' || t.pos !== 'adj') return false;
  const item = lookup(t.itemId ?? '');
  return !!item && (item.categories.includes('feelings') || item.categories.includes('describing') || item.categories.includes('health'));
}

function beFor(subject: string): string {
  if (subject === 'i') return 'am';
  if (THIRD.has(subject)) return 'is';
  return 'are';
}

export function suggestEnglish(input: Token[], lookup: Lookup): Token[] {
  const t = input.map((x) => ({ ...x }));

  for (let i = 0; i < t.length; i++) {
    const w = lower(t[i]!);
    const prev = t[i - 1] ? lower(t[i - 1]!) : null;

    // "me want" -> "I want"
    if (OBJECT_TO_SUBJECT[w] && (i === 0 || (prev && CLAUSE_START.has(prev))) && isVerb(t[i + 1], lookup)) {
      t[i] = { ...t[i]!, text: OBJECT_TO_SUBJECT[w]!, itemId: OBJECT_TO_SUBJECT[w]!.toLowerCase() };
    }
  }

  for (let i = 0; i < t.length; i++) {
    const w = lower(t[i]!);
    const next = t[i + 1];
    if (!SUBJECTS.has(w) || !next) continue;
    const n = lower(next);
    // "I not like" / "he no want" -> "I don't like" / "he doesn't want"
    if ((n === 'not' || n === 'no') && isVerb(t[i + 2], lookup)) {
      t[i + 1] = mk(THIRD.has(w) ? "doesn't" : "don't", 'en', THIRD.has(w) ? 'doesnt' : 'dont', 'verb');
      continue;
    }
    if (n === "don't" && THIRD.has(w)) t[i + 1] = mk("doesn't", 'en', 'doesnt', 'verb');
    if (n === "doesn't" && !THIRD.has(w)) t[i + 1] = mk("don't", 'en', 'dont', 'verb');
    // "I is" -> "I am"
    if (BE_FORMS.has(n) && n !== beFor(w)) t[i + 1] = mk(beFor(w), 'en', beFor(w), 'verb');
    // "he have" -> "he has"
    if (THIRD.has(w) && n === 'have') t[i + 1] = mk('has', 'en', 'have', 'verb');
    // "he want" -> "he wants"
    else if (THIRD.has(w) && isVerb(next, lookup) && !next.form && next.itemId) {
      const item = lookup(next.itemId);
      if (item?.forms.en && item.forms.en.text.toLowerCase() === n) {
        t[i + 1] = { ...next, text: inflect(next.text, 's', item.grammar?.irregular), form: 's' };
      }
    }
    // "I happy" -> "I am happy"
    if (isAdjective(next, lookup)) {
      t.splice(i + 1, 0, mk(beFor(w), 'en', beFor(w), 'verb'));
      i++;
    }
  }

  for (let i = 0; i < t.length - 1; i++) {
    const w = lower(t[i]!);
    const next = t[i + 1]!;
    // "want go" -> "want to go"
    if (TO_VERBS.has(w) && t[i]!.kind === 'word' && isVerb(next, lookup) && lower(next) !== 'to') {
      t.splice(i + 1, 0, mk('to', 'en', 'to', 'prep'));
      continue;
    }
    // "go shop" -> "go to the shop"
    if (MOTION.has(w) && next.itemId && next.pos === 'noun') {
      const item = lookup(next.itemId);
      const isPlace = item?.categories.some((c) => PLACE_CATEGORIES.has(c));
      if (isPlace && !NO_TO_PLACES.has(next.itemId)) {
        const add = [mk('to', 'en', 'to', 'prep')];
        if (!NO_ARTICLE_PLACES.has(next.itemId)) add.push(mk('the', 'en', 'the', 'det'));
        t.splice(i + 1, 0, ...add);
        i += add.length;
      }
    }
  }

  // "want apple" -> "want an apple"
  for (let i = 0; i < t.length - 1; i++) {
    const w = lower(t[i]!);
    const next = t[i + 1]!;
    if (!ARTICLE_VERBS.has(w) || next.kind !== 'word' || next.pos !== 'noun' || next.form === 'pl') continue;
    const item = lookup(next.itemId ?? '');
    if (!item || item.grammar?.uncountable || item.categories.some((c) => NO_ARTICLE_CATEGORIES.has(c))) continue;
    if (/s$/.test(next.text) || /^[A-Z]/.test(next.text) || DETERMINERS.has(lower(next))) continue;
    t.splice(i + 1, 0, mk(startsWithVowelSound(next.text) ? 'an' : 'a', 'en', startsWithVowelSound(next.text) ? 'an' : 'a', 'det'));
  }

  // "a apple" -> "an apple"
  for (let i = 0; i < t.length - 1; i++) {
    const w = lower(t[i]!);
    if (w !== 'a' && w !== 'an') continue;
    const want = startsWithVowelSound(t[i + 1]!.text) ? 'an' : 'a';
    if (w !== want) t[i] = mk(want, 'en', want, 'det');
  }

  return t;
}

// ---------------- Mandarin ----------------

const ZH_DEGREE = new Set(['很', '太', '不', '真', '非常', '有点', '有一点', '好', '也', '都', '更', '最', '比较', '特别', '没', '这么', '那么', '挺', '還', '还']);
const ZH_NUMBERS = new Set(['一', '二', '两', '兩', '三', '四', '五', '六', '七', '八', '九', '十', '几', '幾', '这', '這', '那']);
const ZH_MEASURES = new Set(['个', '個', '杯', '碗', '瓶', '块', '塊', '张', '張', '本', '只', '隻', '件', '次', '点', '點', '位', '双', '雙', '份', '些']);

function measureFor(item: VocabItem | undefined, traditional: boolean): string {
  const c = item?.categories ?? [];
  if (c.includes('food-drinks')) return '杯';
  if (item?.id === 'book') return '本';
  if (c.includes('animals')) return traditional ? '隻' : '只';
  if (c.includes('clothing')) return '件';
  return traditional ? '個' : '个';
}

export function suggestChinese(input: Token[], lookup: Lookup): Token[] {
  const t = input.map((x) => ({ ...x }));
  const traditional = t.some((x) => /[們個這說話歡應喜麼裡]/.test(x.text));

  for (let i = 0; i < t.length - 1; i++) {
    // 不 + 有 -> 没有
    if ((t[i]!.text === '不') && (t[i + 1]!.text === '有')) {
      t.splice(i, 2, mk(traditional ? '沒有' : '没有', 'zh', 'zh-meiyou', 'verb'));
    }
  }
  for (let i = 0; i < t.length - 1; i++) {
    const next = t[i + 1]!;
    // 二个 -> 两个
    if (t[i]!.text === '二' && ZH_MEASURES.has(next.text)) t[i] = mk(traditional ? '兩' : '两', 'zh', 'zh-liang', 'num');
    // 一 苹果 -> 一个苹果
    if (ZH_NUMBERS.has(t[i]!.text) && next.pos === 'noun' && !ZH_MEASURES.has(next.text)) {
      const item = lookup(next.itemId ?? '');
      t.splice(i + 1, 0, mk(measureFor(item, traditional), 'zh', undefined, 'measure'));
      i++;
    }
  }
  // 我 开心 -> 我很开心 (a describing word straight after the subject, at the end of the sentence)
  for (let i = 1; i < t.length; i++) {
    const subj = t[i - 1]!;
    const adj = t[i]!;
    const after = t[i + 1]?.text;
    const isSubject = subj.pos === 'pron' || lookup(subj.itemId ?? '')?.categories.includes('people');
    const endsHere = after === undefined || after === '吗' || after === '嗎' || after === '呢';
    if (isSubject && adj.pos === 'adj' && endsHere && !ZH_DEGREE.has(subj.text) && [...adj.text].length <= 2) {
      t.splice(i, 0, mk('很', 'zh', 'very', 'adv'));
      i++;
    }
  }
  // 了了 -> 了
  return t.filter((x, i) => !(x.text === '了' && t[i - 1]?.text === '了'));
}

/**
 * Suggest a more natural version of the message. Returns null when there is nothing to suggest.
 * Mixed-language messages are checked one language run at a time.
 */
export function suggestGrammar(tokens: Token[], lookup: Lookup): Token[] | null {
  if (tokens.length < 2) return null;
  const out: Token[] = [];
  let run: Token[] = [];
  const flush = () => {
    if (!run.length) return;
    out.push(...(run[0]!.lang === 'en' ? suggestEnglish(run, lookup) : suggestChinese(run, lookup)));
    run = [];
  };
  for (const tok of tokens) {
    if (run.length && run[0]!.lang !== tok.lang) flush();
    run.push(tok);
  }
  flush();
  const same = out.length === tokens.length && out.every((x, i) => x.text === tokens[i]!.text);
  return same ? null : out;
}
