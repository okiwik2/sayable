import type { Page } from '@playwright/test';

/**
 * Replace the browser's speech engine with a recorder, so tests can check exactly what
 * would be spoken and in which language, without sound.
 */
export async function mockSpeech(page: Page, opts: { voices?: { name: string; lang: string; localService?: boolean }[] } = {}) {
  const voices = opts.voices ?? [
    { name: 'Test English', lang: 'en-NZ', localService: true },
    { name: 'Test Mandarin', lang: 'zh-CN', localService: true },
    { name: 'Test Cantonese', lang: 'zh-HK', localService: true },
  ];
  await page.addInitScript((voiceList) => {
    const spoken: { text: string; lang: string; voice: string | null; volume: number }[] = [];
    (window as unknown as { __spoken: typeof spoken }).__spoken = spoken;
    const voiceObjs = voiceList.map((v) => ({ ...v, voiceURI: v.name, default: false, localService: v.localService ?? true }));
    let speaking = false;
    const listeners: Record<string, (() => void)[]> = {};
    const synth = {
      get speaking() {
        return speaking;
      },
      paused: false,
      pending: false,
      getVoices: () => voiceObjs,
      speak(u: SpeechSynthesisUtterance) {
        speaking = true;
        spoken.push({ text: u.text, lang: u.lang, voice: u.voice ? u.voice.name : null, volume: u.volume });
        setTimeout(() => {
          speaking = false;
          u.onend?.(new Event('end') as SpeechSynthesisEvent);
        }, 150);
      },
      cancel() {
        speaking = false;
      },
      pause() {},
      resume() {},
      addEventListener(type: string, fn: () => void) {
        (listeners[type] ??= []).push(fn);
      },
      removeEventListener() {},
    };
    Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
    class FakeUtterance {
      text: string;
      lang = '';
      voice: unknown = null;
      rate = 1;
      pitch = 1;
      volume = 1;
      onend: ((e: Event) => void) | null = null;
      onerror: ((e: Event) => void) | null = null;
      constructor(text: string) {
        this.text = text;
      }
    }
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: FakeUtterance, configurable: true });
  }, voices);
}

export async function spoken(page: Page): Promise<{ text: string; lang: string; voice: string | null; volume: number }[]> {
  return page.evaluate(() => (window as unknown as { __spoken: { text: string; lang: string; voice: string | null; volume: number }[] }).__spoken);
}

/** Skip first-run setup by marking it done through the UI's own button. */
export async function startFresh(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /Start communicating now/ }).click();
}

/** Tap a vocabulary tile by its visible label. */
export async function tap(page: Page, label: string) {
  await page.locator('.grid .tile', { has: page.locator('.label', { hasText: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }) }).first().click();
}
