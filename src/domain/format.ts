// Turns message tokens into readable text and into per-language pieces for the speech engine.
// English and Mandarin are joined differently: English uses spaces, Mandarin does not.
import type { Lang, Token } from './types';

export interface Segment {
  lang: Lang;
  /** What is shown */
  text: string;
  /** What is spoken (pronunciation overrides applied) */
  speech: string;
}

export interface FormatOptions {
  autoCapitalize?: boolean;
  autoPunctuate?: boolean;
}

const EN_PUNCT = /^[.,!?;:…]+$/;
const ZH_PUNCT = /^[。，！？；：、…]+$/;
const ENDS_SENTENCE = /[.!?…。！？]$/;

const EN_QUESTION_WORDS = new Set([
  'what', 'where', 'who', 'why', 'when', 'how', 'which', 'whose', 'how many', 'how much', 'how long', 'what time',
  'can you', 'do you', 'is it', 'are you',
]);
const EN_AUX = new Set(['can', 'could', 'will', 'would', 'do', 'does', 'did', 'is', 'are', 'am', 'was', 'were', 'should', 'may', 'shall', 'have', 'has']);
const EN_SUBJECTS = new Set(['i', 'you', 'we', 'they', 'he', 'she', 'it', 'this', 'that', 'there']);
const ZH_QUESTION_ENDINGS = new Set(['吗', '呢', '嗎']);
const ZH_QUESTION_WORDS = ['什么', '什麼', '哪里', '哪裡', '哪儿', '哪兒', '谁', '誰', '为什么', '為什麼', '怎么', '怎麼', '几', '幾', '多少', '哪个', '哪個', '是不是', '有没有', '有沒有', '要不要', '好不好', '可不可以'];

function joinEnglish(parts: string[]): string {
  let out = '';
  for (const p of parts) {
    if (!out) out = p;
    else if (EN_PUNCT.test(p)) out += p;
    else out += ' ' + p;
  }
  return out.replace(/\bi\b/g, 'I');
}

function capitalizeSentences(text: string): string {
  return text.replace(/(^|[.!?]\s+)([a-z])/g, (_, pre: string, ch: string) => pre + ch.toUpperCase());
}

export function isEnglishQuestion(words: string[]): boolean {
  const first = words[0]?.toLowerCase().replace(/[^a-z' ]/g, '');
  if (!first) return false;
  if (EN_QUESTION_WORDS.has(first) || EN_QUESTION_WORDS.has(first.split(' ')[0]!)) {
    // "what I want is…" is rare; treat question words at the start as questions.
    return true;
  }
  const second = words[1]?.toLowerCase();
  return EN_AUX.has(first) && !!second && EN_SUBJECTS.has(second);
}

export function isChineseQuestion(text: string): boolean {
  const last = text.replace(/[。，！？\s]+$/, '').at(-1);
  if (last && ZH_QUESTION_ENDINGS.has(last)) return true;
  return ZH_QUESTION_WORDS.some((w) => text.includes(w));
}

/** Group consecutive tokens that share a language. */
export function groupByLanguage(tokens: Token[]): { lang: Lang; tokens: Token[] }[] {
  const groups: { lang: Lang; tokens: Token[] }[] = [];
  for (const t of tokens) {
    const last = groups.at(-1);
    if (last && last.lang === t.lang) last.tokens.push(t);
    else groups.push({ lang: t.lang, tokens: [t] });
  }
  return groups;
}

function finishEnglish(text: string, words: string[], opts: FormatOptions, isLast: boolean): string {
  let out = text;
  if (opts.autoCapitalize) out = capitalizeSentences(out);
  if (opts.autoPunctuate && isLast && out && !ENDS_SENTENCE.test(out)) {
    out += isEnglishQuestion(words) ? '?' : '.';
  }
  return out;
}

function finishChinese(text: string, opts: FormatOptions, isLast: boolean): string {
  let out = text.replace(/\?/g, '？').replace(/!/g, '！').replace(/,/g, '，');
  if (opts.autoPunctuate && isLast && out && !ENDS_SENTENCE.test(out)) {
    out += isChineseQuestion(out) ? '？' : '。';
  }
  return out;
}

export function formatMessage(tokens: Token[], opts: FormatOptions = { autoCapitalize: true, autoPunctuate: true }): {
  text: string;
  segments: Segment[];
} {
  const groups = groupByLanguage(tokens);
  const segments: Segment[] = groups.map((g, i) => {
    const isLast = i === groups.length - 1;
    if (g.lang === 'en') {
      const shown = g.tokens.map((t) => t.text);
      const spoken = g.tokens.map((t) => t.say ?? t.text);
      const text = finishEnglish(joinEnglish(shown), shown, opts, isLast);
      const speech = finishEnglish(joinEnglish(spoken), spoken, opts, isLast);
      return { lang: 'en', text, speech };
    }
    const text = finishChinese(g.tokens.map((t) => t.text).join(''), opts, isLast);
    const speech = finishChinese(g.tokens.map((t) => t.say ?? t.text).join(''), opts, isLast);
    return { lang: g.lang, text, speech };
  });
  return { text: segments.map((s) => s.text).join(' '), segments };
}

/** Split long text into chunks the speech engine handles reliably (some browsers stop after ~15 s). */
export function chunkForSpeech(text: string, max = 180): string[] {
  if (text.length <= max) return [text];
  const sentences = text.match(/[^.!?。！？]+[.!?。！？]*\s*/g) ?? [text];
  const chunks: string[] = [];
  let current = '';
  for (const s of sentences) {
    if ((current + s).length > max && current) {
      chunks.push(current.trim());
      current = '';
    }
    if (s.length > max) {
      // Very long sentence: split at commas or spaces.
      // No lookbehind here: Safari before iOS 16.4 can't parse it, and the whole app fails to load.
      const pieces = s.replace(/([,，、])\s*/g, '$1\n').split(/\n|\s+/).filter(Boolean);
      for (const p of pieces) {
        if ((current + ' ' + p).length > max && current) {
          chunks.push(current.trim());
          current = '';
        }
        current += (current && !/[一-鿿]$/.test(current) ? ' ' : '') + p;
      }
    } else current += s;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

export function isPunctuation(text: string): boolean {
  return EN_PUNCT.test(text) || ZH_PUNCT.test(text);
}
