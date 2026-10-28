// The device's own text-to-speech (Android TTS / iOS AVSpeechSynthesizer), shaped like the browser's
// speechSynthesis so SpeechService keeps all of its rules (voice per language, never Cantonese, ...).
import { TextToSpeech, QueueStrategy } from '@capacitor-community/text-to-speech';
import type { SpeechEngine, Utterance } from './speech';

export function createNativeEngine(): SpeechEngine {
  let voices: SpeechSynthesisVoice[] = [];
  let speaking = false;
  const voiceListeners = new Set<() => void>();

  const load = async () => {
    try {
      const r = await TextToSpeech.getSupportedVoices();
      voices = r.voices as unknown as SpeechSynthesisVoice[];
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
