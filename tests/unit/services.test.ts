import { describe, expect, it, vi } from 'vitest';
import { pickVoice, applyPronunciations, SpeechService, voiceMatchesLang } from '../../src/services/speech';
import { migrateSettings, defaultSettings } from '../../src/domain/settings';
import { buildVocabulary, itemsInCategory, emptyCategoryPrefs, isHidden } from '../../src/domain/vocabulary';
import { dataset } from '../../src/data/dataset';
import { formatMessage } from '../../src/domain/format';
import { toks } from './helpers';

const voice = (name: string, lang: string, localService = true, isDefault = false) => ({ voiceURI: name, name, lang, localService, default: isDefault });

describe('voice selection', () => {
  const voices = [voice('Karen', 'en-AU'), voice('Aria Online', 'en-US', false), voice('Sinji', 'zh-HK'), voice('Tingting', 'zh-CN'), voice('Meijia', 'zh-TW')];
  it('prefers the chosen voice when it matches the language', () => {
    expect(pickVoice(voices, 'en', 'Aria Online')?.name).toBe('Aria Online');
  });
  it('never uses a voice from another language, even if chosen', () => {
    expect(pickVoice(voices, 'zh', 'Karen')?.name).toBe('Tingting');
  });
  it('prefers Mainland Mandarin, then Taiwan Mandarin, and never Cantonese', () => {
    expect(pickVoice(voices, 'zh')?.name).toBe('Tingting');
    expect(pickVoice(voices.filter((v) => v.name !== 'Tingting'), 'zh')?.name).toBe('Meijia');
    expect(pickVoice([voice('Sinji', 'zh-HK'), voice('Karen', 'en-AU')], 'zh')).toBeNull();
    expect(voiceMatchesLang({ lang: 'zh-CN', name: 'Microsoft Cantonese' }, 'zh')).toBe(false);
  });
  it('prefers voices that work offline', () => {
    expect(pickVoice([voice('Online NZ', 'en-NZ', false), voice('Local NZ', 'en-NZ', true)], 'en')?.name).toBe('Local NZ');
  });
});

describe('pronunciation fixes', () => {
  it('replaces whole English words only', () => {
    const fixes = [{ lang: 'en' as const, written: 'Ngaio', spoken: 'Nye oh' }];
    expect(applyPronunciations('Hi Ngaio, Ngaios', 'en', fixes)).toBe('Hi Nye oh, Ngaios');
    expect(applyPronunciations('你好', 'zh', [{ lang: 'zh', written: '好', spoken: '号' }])).toBe('你号');
  });
});

describe('speech service', () => {
  function fakeSynth(voices: ReturnType<typeof voice>[]) {
    const spoken: { text: string; lang: string; voice: string | null }[] = [];
    const synth = {
      speaking: false,
      paused: false,
      getVoices: () => voices,
      speak: (u: { text: string; lang: string; voice: { name: string } | null; onend?: () => void }) => {
        spoken.push({ text: u.text, lang: u.lang, voice: u.voice?.name ?? null });
        setTimeout(() => u.onend?.(), 1);
      },
      cancel: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      addEventListener: vi.fn(),
    };
    return { synth, spoken };
  }
  class FakeUtterance {
    text: string;
    lang = '';
    voice: unknown = null;
    rate = 1;
    pitch = 1;
    volume = 1;
    onend: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(text: string) {
      this.text = text;
    }
  }
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
  const opts = { voices: {}, rate: 1, pitch: 1, volume: 1 };

  it('speaks each language segment with its own voice', async () => {
    const { synth, spoken } = fakeSynth([voice('Karen', 'en-AU'), voice('Tingting', 'zh-CN')]);
    const s = new SpeechService(synth as unknown as SpeechSynthesis);
    const { segments } = formatMessage([...toks('en', 'i', 'want'), ...toks('zh', 'dumplings')]);
    const result = await s.speak(segments, opts);
    expect(result.ok).toBe(true);
    expect(spoken).toEqual([
      { text: 'I want', lang: 'en-AU', voice: 'Karen' },
      { text: '饺子。', lang: 'zh-CN', voice: 'Tingting' },
    ]);
    expect(s.getStatus()).toBe('idle');
  });

  it('reports a missing Mandarin voice instead of reading Chinese in English', async () => {
    const { synth, spoken } = fakeSynth([voice('Karen', 'en-AU')]);
    const s = new SpeechService(synth as unknown as SpeechSynthesis);
    const result = await s.speak(formatMessage(toks('zh', 'i', 'zh-yao')).segments, opts);
    expect(spoken).toEqual([]);
    expect(result.missingVoices).toEqual(['zh']);
  });

  it('stops at once and returns to idle', async () => {
    const { synth } = fakeSynth([voice('Karen', 'en-AU')]);
    const s = new SpeechService(synth as unknown as SpeechSynthesis);
    const statuses: string[] = [];
    s.onStatus((x) => statuses.push(x));
    const p = s.speak(formatMessage(toks('en', 'i', 'want', 'water')).segments, opts);
    s.stop();
    await p;
    expect(synth.cancel).toHaveBeenCalled();
    expect(s.getStatus()).toBe('idle');
    expect(statuses).toContain('speaking');
  });
});

describe('settings', () => {
  it('fills in new settings and ignores unknown or broken ones', () => {
    const s = migrateSettings({ rate: 1.4, theme: 'dark', bogus: 1, volume: 'loud' } as never);
    expect(s.rate).toBe(1.4);
    expect(s.theme).toBe('dark');
    expect(s.volume).toBe(defaultSettings().volume);
    expect((s as unknown as Record<string, unknown>).bogus).toBeUndefined();
    expect(s.pinned).toContain('q-stop');
  });
});

describe('personal vocabulary', () => {
  it('applies renames and photos without changing the built-in data', () => {
    const v = buildVocabulary(dataset, [], [{ itemId: 'mum', label: { en: 'Mama' }, imageId: 'img1' }]);
    expect(v.items.get('mum')!.forms.en!.text).toBe('Mama');
    expect(v.items.get('mum')!.symbol).toEqual({ set: 'custom', id: 'img1' });
    expect(dataset.items.find((i) => i.id === 'mum')!.forms.en!.text).toBe('mum');
  });

  it('never hides essential words', () => {
    const v = buildVocabulary(dataset, [], [{ itemId: 'stop', hidden: true }, { itemId: 'apple', hidden: true }]);
    expect(isHidden(v, 'stop')).toBe(false);
    expect(isHidden(v, 'apple')).toBe(true);
  });

  it('adaptive ordering moves often-used topic words forward but keeps locked ones in place', () => {
    const prefs = emptyCategoryPrefs();
    const v = buildVocabulary(dataset, [], [{ itemId: 'banana', locked: true }]);
    const before = itemsInCategory(v, 'food-fruit', ['en'], prefs).map((i) => i.id);
    const usage = new Map([['cherry', { count: 30, last: Date.now() }]]);
    const after = itemsInCategory(v, 'food-fruit', ['en'], prefs, { adaptive: true, usage }).map((i) => i.id);
    expect(after.indexOf('cherry')).toBeLessThan(before.indexOf('cherry'));
    expect(after.indexOf('banana')).toBe(before.indexOf('banana'));
    expect(itemsInCategory(v, 'food-fruit', ['en'], prefs, { adaptive: false, usage }).map((i) => i.id)).toEqual(before);
  });
});
