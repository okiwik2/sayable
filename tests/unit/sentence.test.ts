import { describe, expect, it } from 'vitest';
import {
  EMPTY_MESSAGE, insert, removeAt, deleteLast, move, replaceAt, setCursor, replaceAll, popUndo, pushUndo, tokenFor, typedToken,
} from '../../src/domain/sentence';
import { formatMessage, chunkForSpeech, isEnglishQuestion } from '../../src/domain/format';
import { toks, texts, vocab } from './helpers';

describe('sentence builder', () => {
  it('adds words in order and builds the sentence', () => {
    let m = EMPTY_MESSAGE;
    for (const t of toks('en', 'i', 'want', 'to', 'go', 'outside-place', 'because', 'it', 'is', 'sunny')) m = insert(m, [t]);
    expect(formatMessage(m.tokens).text).toBe('I want to go outside because it is sunny.');
  });

  it('inserts at the cursor and keeps adding after the inserted word', () => {
    let m = insert(EMPTY_MESSAGE, toks('en', 'i', 'water'));
    m = setCursor(m, 1);
    m = insert(m, toks('en', 'want'));
    expect(m.cursor).toBe(2);
    expect(texts(m.tokens)).toEqual(['I', 'want', 'water']);
    m = setCursor(m, null);
    m = insert(m, toks('en', 'please'));
    expect(texts(m.tokens)).toEqual(['I', 'want', 'water', 'please']);
  });

  it('removes, deletes the last word, moves and replaces', () => {
    let m = insert(EMPTY_MESSAGE, toks('en', 'i', 'want', 'water', 'please'));
    m = removeAt(m, 3);
    expect(texts(m.tokens)).toEqual(['I', 'want', 'water']);
    m = deleteLast(m);
    expect(texts(m.tokens)).toEqual(['I', 'want']);
    m = insert(m, toks('en', 'juice'));
    m = move(m, 2, 0);
    expect(texts(m.tokens)).toEqual(['juice', 'I', 'want']);
    m = replaceAt(m, 0, toks('en', 'milk')[0]!);
    expect(texts(m.tokens)).toEqual(['milk', 'I', 'want']);
  });

  it('deleteLast removes the word before the cursor', () => {
    let m = insert(EMPTY_MESSAGE, toks('en', 'i', 'really', 'want'));
    m = setCursor(m, 2);
    m = deleteLast(m);
    expect(texts(m.tokens)).toEqual(['I', 'want']);
    expect(m.cursor).toBe(1);
  });

  it('undo returns earlier states, newest first', () => {
    let stack = { past: [] as typeof EMPTY_MESSAGE[] };
    let m = EMPTY_MESSAGE;
    for (const t of toks('en', 'i', 'want', 'water')) {
      stack = pushUndo(stack, m);
      m = insert(m, [t]);
    }
    let r = popUndo(stack);
    expect(texts(r.state!.tokens)).toEqual(['I', 'want']);
    r = popUndo(r.stack);
    expect(texts(r.state!.tokens)).toEqual(['I']);
  });

  it('replaceAll gives fresh token ids', () => {
    const original = toks('en', 'i', 'want');
    const m = replaceAll(original);
    expect(m.tokens.map((t) => t.id)).not.toEqual(original.map((t) => t.id));
  });

  it('applies word forms', () => {
    const want = vocab.items.get('want')!;
    expect(tokenFor(want, 'en', { form: 's' })!.text).toBe('wants');
    const go = vocab.items.get('go')!;
    expect(tokenFor(go, 'en', { form: 'past' })!.text).toBe('went');
  });

  it('returns null for an item without that language', () => {
    expect(tokenFor(vocab.items.get('the')!, 'zh')).toBeNull();
    expect(tokenFor(vocab.items.get('zh-le')!, 'en')).toBeNull();
  });
});

describe('formatting', () => {
  it('makes questions end with a question mark', () => {
    expect(formatMessage(toks('en', 'where', 'is', 'my', 'bag')).text).toBe('Where is my bag?');
    expect(formatMessage(toks('en', 'can', 'i', 'go', 'outside-place')).text).toBe('Can I go outside?');
    expect(isEnglishQuestion(['I', 'can', 'go'])).toBe(false);
  });

  it('keeps phrase punctuation and does not double it', () => {
    expect(formatMessage(toks('en', 'can-you-help-me')).text).toBe('Can you help me, please?');
  });

  it('can be turned off', () => {
    expect(formatMessage(toks('en', 'i', 'want', 'water'), {}).text).toBe('I want water');
  });

  it('joins Mandarin without spaces, in the order chosen', () => {
    const r = formatMessage(toks('zh', 'i', 'zh-yao', 'drink', 'water'));
    expect(r.text).toBe('我要喝水。');
    expect(formatMessage(toks('zh', 'you', 'like', 'zh-ma')).text).toBe('你喜欢吗？');
    expect(formatMessage(toks('zh', 'you', 'zh-yao', 'what')).text).toBe('你要什么？');
  });

  it('splits mixed-language messages into language segments for speech', () => {
    const tokens = [...toks('en', 'i', 'want'), ...toks('zh', 'dumplings')];
    const r = formatMessage(tokens);
    expect(r.segments.map((s) => s.lang)).toEqual(['en', 'zh']);
    expect(r.segments[1]!.text).toBe('饺子。');
  });

  it('uses pronunciation overrides for speech but not for display', () => {
    const t = typedToken('Ngaio', 'en');
    t.say = 'Nye oh';
    const r = formatMessage([t], {});
    expect(r.text).toBe('Ngaio');
    expect(r.segments[0]!.speech).toBe('Nye oh');
  });

  it('chunks long text for speech engines', () => {
    const long = 'This is a sentence. '.repeat(30);
    const chunks = chunkForSpeech(long, 100);
    expect(chunks.length).toBeGreaterThan(3);
    expect(chunks.every((c) => c.length <= 100)).toBe(true);
    expect(chunks.join(' ').replace(/\s+/g, ' ')).toBe(long.trim());
  });
});
