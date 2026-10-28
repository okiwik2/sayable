import { describe, it, expect } from 'vitest';
import { SpeechService, type SpeechEngine, type Utterance } from '../../src/services/speech';
import { isNewer } from '../../src/services/platform';

/** A fake of the device's own text-to-speech: no pausing, plain utterance objects. */
function fakeNativeEngine(voices: { name: string; lang: string }[]) {
  const spoken: { text: string; voice: string | undefined; lang: string }[] = [];
  let stopped = 0;
  const engine: SpeechEngine = {
    canPause: false,
    speaking: false,
    paused: false,
    getVoices: () => voices.map((v) => ({ ...v, voiceURI: v.name, localService: true, default: false })) as unknown as SpeechSynthesisVoice[],
    speak(u: Utterance) {
      spoken.push({ text: u.text, voice: u.voice?.name, lang: u.lang });
      setTimeout(() => u.onend?.(new Event('end')), 5);
    },
    cancel() {
      stopped++;
    },
    pause() {},
    resume() {},
  };
  return { engine, spoken, stopped: () => stopped };
}

describe('native speech engine', () => {
  it('keeps the voice rules: each language its own voice, never Cantonese', async () => {
    const { engine, spoken } = fakeNativeEngine([
      { name: 'Karen', lang: 'en-AU' },
      { name: 'Sinji', lang: 'zh-HK' },
      { name: 'Tingting', lang: 'zh-CN' },
    ]);
    const s = new SpeechService(null);
    s.setEngine(engine);
    const r = await s.speak(
      [
        { lang: 'en', text: 'I want', speech: 'I want' },
        { lang: 'zh', text: '水', speech: '水' },
      ],
      { voices: {}, rate: 1, pitch: 1, volume: 1 },
    );
    expect(r.ok).toBe(true);
    expect(spoken).toEqual([
      { text: 'I want', voice: 'Karen', lang: 'en-AU' },
      { text: '水', voice: 'Tingting', lang: 'zh-CN' },
    ]);
  });

  it('pausing stops instead, because native speech cannot pause', async () => {
    const { engine, stopped } = fakeNativeEngine([{ name: 'Karen', lang: 'en-AU' }]);
    const s = new SpeechService(null);
    s.setEngine(engine);
    void s.speak([{ lang: 'en', text: 'Hello there', speech: 'Hello there' }], { voices: {}, rate: 1, pitch: 1, volume: 1 });
    s.pause();
    expect(s.getStatus()).toBe('idle');
    expect(stopped()).toBeGreaterThan(0);
  });
});

describe('Android update check', () => {
  it('compares versions', () => {
    expect(isNewer('1.0.1', '1.0.0')).toBe(true);
    expect(isNewer('1.10.0', '1.9.9')).toBe(true);
    expect(isNewer('1.0.0', '1.0.0')).toBe(false);
    expect(isNewer('0.9.0', '1.0.0')).toBe(false);
  });
});

describe('Android voice names', () => {
  it('tells apart voices that Android names only by language', async () => {
    const { nameVoices } = await import('../../src/services/speech-native');
    const named = nameVoices([
      { voiceURI: 'en-us-x-iob-local', name: 'English United States' },
      { voiceURI: 'en-us-x-tpf-network', name: 'English United States' },
      { voiceURI: 'cmn-cn-x-ccc-local', name: 'Chinese China' },
    ]);
    expect(named.map((v) => v.name)).toEqual(['English United States 1 (IOB)', 'English United States 2 (TPF)', 'Chinese China']);
  });
});
