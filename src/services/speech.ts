// Speech output through the device's own text-to-speech voices (Web Speech API).
// One shared service so that every part of the app speaks the same way, stopping is instant,
// and Mandarin is never read out with an English voice.
import type { Lang } from '../domain/types';
import type { Segment } from '../domain/format';
import { chunkForSpeech } from '../domain/format';

export type SpeechStatus = 'idle' | 'speaking' | 'paused';

export interface VoiceInfo {
  id: string;
  name: string;
  lang: string;
  /** false = the voice needs an internet connection */
  local: boolean;
  isDefault: boolean;
}

export interface SpeakOptions {
  voices: Partial<Record<Lang, string>>;
  rate: number;
  pitch: number;
  volume: number;
  pauseBetweenMs?: number;
  /** Written -> spoken replacements, applied before speaking. */
  pronunciations?: { lang: Lang; written: string; spoken: string }[];
}

export interface SpeakResult {
  ok: boolean;
  /** Languages that could not be spoken because no suitable voice is installed. */
  missingVoices: Lang[];
  error?: string;
}

type Listener = (status: SpeechStatus) => void;

const BCP47: Record<Lang, string[]> = {
  en: ['en-NZ', 'en-AU', 'en-GB', 'en-US', 'en'],
  // Mandarin: Mainland first, then Taiwan Mandarin. Cantonese (zh-HK, yue) is a different language.
  zh: ['zh-CN', 'cmn-CN', 'zh-TW', 'cmn-TW', 'zh-SG', 'zh'],
};

const isCantonese = (v: { lang: string; name: string }) =>
  /^(zh-HK|yue)/i.test(v.lang) || /cantonese|粤|粵|廣東|广东/i.test(v.name);

export function voiceMatchesLang(v: { lang: string; name: string }, lang: Lang): boolean {
  const l = v.lang.replace('_', '-').toLowerCase();
  if (lang === 'en') return l.startsWith('en');
  return (l.startsWith('zh') || l.startsWith('cmn')) && !isCantonese(v);
}

/** Choose a voice: the user's choice if available, otherwise the best match for the language. */
export function pickVoice<V extends { voiceURI: string; lang: string; name: string; localService: boolean; default: boolean }>(
  voices: V[],
  lang: Lang,
  preferredId?: string,
): V | null {
  if (preferredId) {
    const chosen = voices.find((v) => v.voiceURI === preferredId);
    if (chosen && voiceMatchesLang(chosen, lang)) return chosen;
  }
  const candidates = voices.filter((v) => voiceMatchesLang(v, lang));
  if (!candidates.length) return null;
  const rank = (v: V) => {
    const l = v.lang.replace('_', '-');
    const idx = BCP47[lang].findIndex((p) => l.toLowerCase() === p.toLowerCase());
    return (idx === -1 ? 50 : idx) + (v.localService ? 0 : 0.5) - (v.default ? 0.25 : 0);
  };
  return [...candidates].sort((a, b) => rank(a) - rank(b))[0] ?? null;
}

export function applyPronunciations(text: string, lang: Lang, fixes: SpeakOptions['pronunciations'] = []): string {
  let out = text;
  for (const f of fixes) {
    if (f.lang !== lang || !f.written.trim()) continue;
    if (lang === 'en') {
      const escaped = f.written.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      out = out.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), f.spoken);
    } else out = out.split(f.written).join(f.spoken);
  }
  return out;
}

export class SpeechService {
  private synth: SpeechSynthesis | null;
  private status: SpeechStatus = 'idle';
  private listeners = new Set<Listener>();
  private voiceListeners = new Set<() => void>();
  private voices: SpeechSynthesisVoice[] = [];
  private runId = 0;
  private keepAlive: ReturnType<typeof setInterval> | null = null;
  private lastStart = { text: '', at: 0 };

  constructor(synth: SpeechSynthesis | null = typeof window !== 'undefined' ? window.speechSynthesis ?? null : null) {
    this.synth = synth;
    if (!synth) return;
    this.loadVoices();
    synth.addEventListener?.('voiceschanged', () => this.loadVoices());
    // Some browsers fill the voice list late and never fire voiceschanged.
    let tries = 0;
    const poll = setInterval(() => {
      if (this.voices.length || ++tries > 20) clearInterval(poll);
      else this.loadVoices();
    }, 250);
  }

  get supported(): boolean {
    return !!this.synth;
  }

  private loadVoices() {
    if (!this.synth) return;
    const list = this.synth.getVoices();
    if (list.length) {
      this.voices = list;
      this.voiceListeners.forEach((l) => l());
    }
  }

  listVoices(): VoiceInfo[] {
    return this.voices.map((v) => ({ id: v.voiceURI, name: v.name, lang: v.lang, local: v.localService, isDefault: v.default }));
  }

  hasVoiceFor(lang: Lang): boolean {
    return this.voices.some((v) => voiceMatchesLang(v, lang));
  }

  onVoicesChanged(fn: () => void): () => void {
    this.voiceListeners.add(fn);
    return () => this.voiceListeners.delete(fn);
  }

  onStatus(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  getStatus(): SpeechStatus {
    return this.status;
  }

  private setStatus(s: SpeechStatus) {
    if (this.status === s) return;
    this.status = s;
    this.listeners.forEach((l) => l(s));
  }

  /** Stop immediately. Safe to call at any time. */
  stop() {
    this.runId++;
    this.clearKeepAlive();
    try {
      this.synth?.cancel();
    } catch {
      /* ignore */
    }
    this.setStatus('idle');
  }

  pause() {
    if (this.status !== 'speaking' || !this.synth) return;
    this.synth.pause();
    this.setStatus('paused');
  }

  resume() {
    if (this.status !== 'paused' || !this.synth) return;
    this.synth.resume();
    this.setStatus('speaking');
  }

  private clearKeepAlive() {
    if (this.keepAlive) clearInterval(this.keepAlive);
    this.keepAlive = null;
  }

  /**
   * Speak message segments in order. Each segment uses a voice for its own language.
   * Segments with no suitable voice are skipped and reported, never read with the wrong voice.
   */
  async speak(segments: Segment[], opts: SpeakOptions): Promise<SpeakResult> {
    const synth = this.synth;
    if (!synth) return { ok: false, missingVoices: [], error: 'unsupported' };
    const text = segments.map((s) => s.speech).join(' ').trim();
    if (!text) return { ok: true, missingVoices: [] };

    // A second tap on Speak within a moment is treated as accidental.
    const now = Date.now();
    if (this.status === 'speaking' && this.lastStart.text === text && now - this.lastStart.at < 700) {
      return { ok: true, missingVoices: [] };
    }
    this.stop();
    const run = ++this.runId;
    this.lastStart = { text, at: now };
    if (!this.voices.length) this.loadVoices();

    const missing = new Set<Lang>();
    const plan: { text: string; lang: Lang; voice: SpeechSynthesisVoice | null }[] = [];
    for (const seg of segments) {
      const voice = pickVoice(this.voices, seg.lang, opts.voices[seg.lang]);
      // With no voice list at all (some browsers), fall back to the language tag alone for English.
      if (!voice && (this.voices.length || seg.lang !== 'en')) {
        missing.add(seg.lang);
        continue;
      }
      const spoken = applyPronunciations(seg.speech, seg.lang, opts.pronunciations);
      for (const chunk of chunkForSpeech(spoken)) plan.push({ text: chunk, lang: seg.lang, voice });
    }
    if (!plan.length) return { ok: false, missingVoices: [...missing], error: 'no-voice' };

    this.setStatus('speaking');
    // Chrome stops long utterances after ~15 seconds unless nudged.
    this.keepAlive = setInterval(() => {
      if (synth.speaking && !synth.paused) {
        synth.pause();
        synth.resume();
      }
    }, 10000);

    let error: string | undefined;
    for (let i = 0; i < plan.length; i++) {
      if (run !== this.runId) break;
      const step = plan[i]!;
      if (i > 0 && plan[i - 1]!.lang !== step.lang && opts.pauseBetweenMs) {
        await new Promise((r) => setTimeout(r, opts.pauseBetweenMs));
        if (run !== this.runId) break;
      }
      const result = await this.utter(synth, step, opts);
      if (result && result !== 'interrupted' && result !== 'canceled') {
        error = result;
        break;
      }
    }
    if (run === this.runId) {
      this.clearKeepAlive();
      this.setStatus('idle');
    }
    return { ok: !error, missingVoices: [...missing], error };
  }

  private utter(
    synth: SpeechSynthesis,
    step: { text: string; lang: Lang; voice: SpeechSynthesisVoice | null },
    opts: SpeakOptions,
  ): Promise<string | null> {
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(step.text);
      if (step.voice) {
        u.voice = step.voice;
        u.lang = step.voice.lang;
      } else u.lang = BCP47[step.lang][0]!;
      u.rate = clamp(opts.rate, 0.3, 2.5);
      u.pitch = clamp(opts.pitch, 0, 2);
      u.volume = clamp(opts.volume, 0, 1);
      let settled = false;
      const done = (err: string | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(watchdog);
        resolve(err);
      };
      u.onend = () => done(null);
      u.onerror = (e) => done((e as SpeechSynthesisErrorEvent).error ?? 'error');
      // If the engine never reports back, do not leave the app stuck in "speaking".
      const watchdog = setTimeout(() => done(null), 4000 + step.text.length * 180 / Math.max(0.3, opts.rate));
      synth.speak(u);
    });
  }
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export const speech = new SpeechService();
