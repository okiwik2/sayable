// The device's own text-to-speech (Android TTS / iOS AVSpeechSynthesizer), shaped like the browser's
// speechSynthesis so SpeechService keeps all of its rules (voice per language, never Cantonese, ...).
import { TextToSpeech, QueueStrategy } from '@capacitor-community/text-to-speech';
import type { SpeechEngine, Utterance } from './speech';

/**
 * Android names every voice by its language alone ("English United States"), so a list of ten US
 * voices looks like one voice ten times. Number the ones that share a name, and add the engine's
 * own short code where there is one (Google: "en-us-x-iob-local" -> "IOB").
 */
export function nameVoices<V extends { voiceURI: string; name: string }>(voices: V[]): V[] {
  const counts = new Map<string, number>();
  for (const v of voices) counts.set(v.name, (counts.get(v.name) ?? 0) + 1);
  const seen = new Map<string, number>();
  return voices.map((v) => {
    if ((counts.get(v.name) ?? 0) < 2) return v;
    const n = (seen.get(v.name) ?? 0) + 1;
    seen.set(v.name, n);
    const code = /-x-([a-z0-9]+)/i.exec(v.voiceURI)?.[1]?.toUpperCase();
    return { ...v, name: `${v.name} ${n}${code ? ` (${code})` : ''}` };
  });
}

export function createNativeEngine(): SpeechEngine {
  let voices: SpeechSynthesisVoice[] = [];
  let speaking = false;
  const voiceListeners = new Set<() => void>();

  const load = async () => {
    try {
      const r = await TextToSpeech.getSupportedVoices();
      voices = nameVoices(r.voices as unknown as SpeechSynthesisVoice[]);
      voiceListeners.forEach((l) => l());
    } catch {
      /* no voices yet; SpeechService polls again */
    }
  };
  void load();
  // Coming back from Android's voice download screen (Settings › Add a voice): pick up new voices.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void load();
  });

  return {
    canPause: false,
    get speaking() {
      return speaking;
    },
    get paused() {
      return false;
    },
    getVoices: () => voices,
    addEventListener: (type: string, fn: () => void) => {
      if (type === 'voiceschanged') voiceListeners.add(fn);
    },
    speak(u: Utterance) {
      speaking = true;
      // The plugin picks voices by their position in its own list.
      const index = u.voice ? voices.findIndex((v) => v.voiceURI === u.voice!.voiceURI) : -1;
      TextToSpeech.speak({
        text: u.text,
        lang: u.lang,
        rate: u.rate,
        pitch: u.pitch,
        volume: u.volume,
        voice: index >= 0 ? index : undefined,
        // iOS: speak even when the silent switch is on; an AAC voice must always be heard.
        category: 'playback',
        queueStrategy: QueueStrategy.Add,
      })
        .then(() => {
          speaking = false;
          u.onend?.(new Event('end'));
        })
        .catch((e: unknown) => {
          speaking = false;
          u.onerror?.({ error: String(e) } as unknown as Event);
        });
    },
    cancel() {
      speaking = false;
      void TextToSpeech.stop().catch(() => {});
    },
    pause() {},
    resume() {},
  };
}
