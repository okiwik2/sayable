// Checks the vocabulary source files the same way `npm run data:validate` does, so mistakes in
// the word lists fail the test suite: duplicate ids, missing labels, unknown categories, broken
// board or suggestion links and missing symbol pictures.
import { describe, expect, it } from 'vitest';
import { compile } from '../../scripts/lib/compile.mjs';
import { dataset } from '../../src/data/dataset';

describe('vocabulary data', () => {
  const result = compile({ requireAssets: true });

  it('has no errors', () => {
    expect(result.errors).toEqual([]);
  });

  it('matches the built copy the app uses', () => {
    expect(dataset.items.length).toBe(result.dataset.items.length);
  });

  it('is a substantial starter set in both languages', () => {
    const items = result.dataset.items;
    expect(items.length).toBeGreaterThan(1500);
    expect(items.filter((i: { forms: { zh?: unknown } }) => i.forms.zh).length).toBeGreaterThan(1400);
    expect(items.filter((i: { kind: string }) => i.kind === 'phrase').length).toBeGreaterThan(200);
  });

  it('keeps essential words available on every core board size', () => {
    const core = result.dataset.boards.filter((b: { kind: string; lang: string }) => b.kind === 'core' && b.lang === 'en');
    for (const b of core) for (const id of ['i', 'you', 'want', 'go', 'stop', 'help', 'more', 'not', 'what']) expect(b.cells).toContain(id);
  });

  it('every Chinese entry has pinyin and Traditional characters', () => {
    for (const item of result.dataset.items as { id: string; forms: { zh?: { pinyin: string; hant: string } } }[]) {
      if (!item.forms.zh) continue;
      expect(item.forms.zh.pinyin, item.id).toBeTruthy();
      expect(item.forms.zh.hant, item.id).toBeTruthy();
    }
  });
});
