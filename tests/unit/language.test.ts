import { describe, expect, it } from 'vitest';
import { suggestGrammar } from '../../src/domain/grammar';
import { formatMessage } from '../../src/domain/format';
import { predictNext, phrasesWith, learn } from '../../src/domain/predict';
import { inflect, formsFor, pluralize } from '../../src/domain/inflect';
import { buildIndex, search, stripTones } from '../../src/domain/search';
import { dataset } from '../../src/data/dataset';
import { lookup, toks, vocab } from './helpers';

const suggest = (lang: 'en' | 'zh', ...ids: string[]) => {
  const s = suggestGrammar(toks(lang, ...ids), lookup);
  return s ? formatMessage(s).text : null;
};

describe('grammar suggestions (English)', () => {
  it('turns "me want go shop" into "I want to go to the shop."', () => {
    expect(suggest('en', 'me', 'want', 'go', 'shop')).toBe('I want to go to the shop.');
  });
  it('fixes agreement and negation', () => {
    expect(suggest('en', 'he', 'want', 'water')).toBe('He wants water.');
    expect(suggest('en', 'i', 'is', 'tired')).toBe('I am tired.');
    expect(suggest('en', 'i', 'not', 'like', 'it')).toBe("I don't like it.");
    expect(suggest('en', 'she', 'dont', 'like', 'it')).toBe("She doesn't like it.");
    expect(suggest('en', 'i', 'happy')).toBe('I am happy.');
  });
  it('adds a or an only where it fits', () => {
    expect(suggest('en', 'i', 'want', 'apple')).toBe('I want an apple.');
    expect(suggest('en', 'i', 'want', 'water')).toBeNull();
    expect(suggest('en', 'i', 'want', 'mum')).toBeNull();
    expect(suggest('en', 'i', 'go', 'home-place')).toBeNull();
    expect(suggest('en', 'i', 'go', 'school')).toBe('I go to school.');
  });
  it('leaves correct sentences alone', () => {
    expect(suggest('en', 'i', 'want', 'to', 'go', 'outside-place')).toBeNull();
  });
});

describe('grammar suggestions (Mandarin)', () => {
  it('uses Mandarin rules, not English ones', () => {
    expect(suggest('zh', 'i', 'happy')).toBe('我很开心。');
    expect(suggest('zh', 'i', 'not', 'zh-you')).toBe('我没有。');
    expect(suggest('zh', 'i', 'zh-yao', 'one', 'apple')).toBe('我要一个苹果。');
    expect(suggest('zh', 'i', 'zh-yao', 'one', 'water')).toBe('我要一杯水。');
    expect(suggest('zh', 'i', 'zh-yao', 'drink', 'water')).toBeNull();
  });
});

describe('word forms', () => {
  it('handles regular and irregular forms', () => {
    expect(inflect('stop', 'ing')).toBe('stopping');
    expect(inflect('try', 's')).toBe('tries');
    expect(inflect('wake up', 'past')).toBe('woke up');
    expect(inflect('make', 'ing')).toBe('making');
    expect(pluralize('child')).toBe('children');
    expect(pluralize('box')).toBe('boxes');
    expect(formsFor(vocab.items.get('eat')!).map((f) => f.text)).toEqual(['eats', 'ate', 'eating', 'eaten']);
    expect(formsFor(vocab.items.get('apple')!).map((f) => f.text)).toEqual(['apples']);
    expect(formsFor(vocab.items.get('water')!)).toEqual([]);
  });
});

describe('predictions', () => {
  const seeds = dataset.predictions;
  it('suggests likely next words from the starter links', () => {
    const s = predictNext({ lang: 'en', tokens: toks('en', 'i', 'want'), cursor: null, items: vocab.items, seeds: seeds.en });
    expect(s.map((x) => x.text)).toContain('to');
    expect(s.map((x) => x.text)).toContain('more');
  });
  it('suggests word forms', () => {
    const s = predictNext({ lang: 'en', tokens: toks('en', 'he'), cursor: null, items: vocab.items, seeds: seeds.en });
    expect(s.map((x) => x.text)).toContain('wants');
  });
  it('puts what the user has said before first', () => {
    const learned = learn({}, toks('en', 'i', 'want', 'pizza'), vocab.items);
    const s = predictNext({ lang: 'en', tokens: toks('en', 'i', 'want'), cursor: null, items: vocab.items, seeds: seeds.en, learned });
    expect(s[0]!.text).toBe('pizza');
    expect(s[0]!.source).toBe('learned');
  });
  it('works for Mandarin with Mandarin words', () => {
    const s = predictNext({ lang: 'zh', tokens: toks('zh', 'i'), cursor: null, items: vocab.items, seeds: seeds.zh });
    expect(s.map((x) => x.text)).toContain('要');
  });
  it('offers phrases containing the last word', () => {
    const p = phrasesWith(toks('en', 'help')[0], vocab.items).map((i) => i.forms.en!.text);
    expect(p.length).toBeGreaterThan(0);
    expect(p.every((t) => /help/i.test(t))).toBe(true);
  });
});

describe('search', () => {
  const index = buildIndex(vocab.items.values(), vocab.categories);
  const top = (q: string, langs: ('en' | 'zh')[] = ['en', 'zh']) => search(index, q, { langs })[0]?.item.id;
  it('finds words, synonyms and categories', () => {
    expect(top('apple')).toBe('apple');
    expect(top('appl')).toBe('apple');
    expect(top('loo')).toBe('toilet');
    expect(search(index, 'fruit', { langs: ['en'] }).map((r) => r.item.id)).toContain('banana');
  });
  it('finds Chinese by characters, pinyin and tone numbers', () => {
    expect(top('喜欢', ['zh'])).toBe('like');
    expect(top('xihuan', ['zh'])).toBe('like');
    expect(top('xi3huan', ['zh'])).toBe('like');
    expect(top('xǐhuan', ['zh'])).toBe('like');
    expect(top('喜歡', ['zh'])).toBe('like');
  });
  it('respects the active languages', () => {
    expect(search(index, 'le', { langs: ['en'] }).some((r) => r.item.id === 'zh-le')).toBe(false);
    expect(search(index, 'the', { langs: ['zh'] }).some((r) => r.item.id === 'the')).toBe(false);
  });
  it('strips tone marks', () => {
    expect(stripTones('nǚ lǜ')).toBe('nv lv');
  });
});
