// Voice guide: reads setup steps, choices, menus, windows and messages aloud, for people who are
// blind or have low vision. Uses the device's own voices, so it works offline. It only speaks in
// response to something the person did (browsers do not allow speech before the first tap).
import { useEffect } from 'react';
import { useStore, useT } from '../state/store';
import { speech } from '../services/speech';
import type { Lang } from '../domain/types';
import { Icon } from './Icon';

const CJK = /[⺀-鿿豈-﫿　-〿＀-￯]+/g;

/** Split text into English and Chinese runs so each part is read with a matching voice. */
export function guideSegments(text: string): { lang: Lang; text: string }[] {
  const out: { lang: Lang; text: string }[] = [];
  let last = 0;
  for (const m of text.matchAll(CJK)) {
    const before = text.slice(last, m.index).trim();
    if (/[\p{L}\p{N}]/u.test(before)) out.push({ lang: 'en', text: before });
    out.push({ lang: 'zh', text: m[0] });
    last = m.index + m[0].length;
  }
  const rest = text.slice(last).trim();
  if (/[\p{L}\p{N}]/u.test(rest)) out.push({ lang: 'en', text: rest });
  return out;
}

let lastPageAt = 0;

/**
 * Say something with the voice guide. `page` marks a whole-screen announcement (a new step, screen
 * or window); smaller announcements that arrive straight after it are dropped so they don't cut it off.
 */
export function guideSay(text: string, opts: { page?: boolean; force?: boolean; polite?: boolean } = {}) {
  const s = useStore.getState().settings;
  if (!s.voiceGuide && !opts.force) return;
  const clean = text.replace(/\s+/g, ' ').replace(/(\.\s*){2,}/g, '. ').trim();
  if (!clean) return;
  if (!opts.page && !opts.force && Date.now() - lastPageAt < 600) return;
  // Messages that appear on their own wait their turn rather than cutting off a reading.
  if (opts.polite && speech.getStatus() !== 'idle') return;
  if (opts.page) lastPageAt = Date.now();
  const segments = guideSegments(clean).map((x) => ({ ...x, speech: x.text }));
  speech.stop();
  void speech.speak(segments, { voices: s.voices, rate: Math.min(s.rate, 1.1), pitch: s.pitch, volume: s.volume, pauseBetweenMs: 80 });
}

const visibleText = (el: Element | null | undefined) => (el instanceof HTMLElement ? el.innerText : el?.textContent ?? '').replace(/\s+/g, ' ').trim();

/** What a screen reader would say for a control: its name, its state and any help text. */
export function describe(el: HTMLElement, t: ReturnType<typeof useT>): string {
  const byIds = (attr: string) =>
    (el.getAttribute(attr) ?? '').split(/\s+/).filter(Boolean).map((id) => visibleText(document.getElementById(id))).join(' ');
  const field = el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement ? el : null;
  let name = el.getAttribute('aria-label') || byIds('aria-labelledby');
  if (!name && field) name = visibleText(field.labels?.[0]) || (field instanceof HTMLSelectElement ? '' : field.placeholder);
  if (!name) name = visibleText(el);
  const parts = [name];
  const role = el.getAttribute('role');
  const checked = el.getAttribute('aria-checked');
  const pressed = el.getAttribute('aria-pressed');
  if (role === 'radio' && checked) parts.push(checked === 'true' ? t('vgSelected') : t('vgNotSelected'));
  else if ((role === 'switch' || role === 'checkbox') && checked) parts.push(checked === 'true' ? t('vgOn') : t('vgOff'));
  else if (pressed && el.getAttribute('aria-current') !== 'page') parts.push(pressed === 'true' ? t('vgOn') : t('vgOff'));
  if (el.getAttribute('aria-current') === 'page') parts.push(t('vgCurrent'));
  if (field instanceof HTMLSelectElement) parts.push(field.selectedOptions[0]?.text ?? '', t('vgMenu'));
  else if (field instanceof HTMLInputElement && field.type === 'range') parts.push(field.closest('.field')?.querySelector('output')?.textContent ?? field.value);
  else if (field && !['checkbox', 'radio', 'button', 'submit'].includes(field.type)) parts.push(field.value || t('vgEmpty'), t('vgEdit'));
  if ((el as HTMLButtonElement).disabled) parts.push(t('vgUnavailable'));
  parts.push(byIds('aria-describedby'));
  return parts.filter(Boolean).join('. ');
}

const CONTROL = 'button, a[href], select, input, textarea, [role="radio"], [role="switch"], [role="tab"]';
/** These areas make their own sounds (words, messages) or are used too quickly to narrate. */
const QUIET = '.tile, .message-area, .pinned-bar, .suggest-bar, .kb-keys, .kb-candidates, [data-guide-quiet]';

function dialogTitle(d: Element): string {
  const id = d.getAttribute('aria-labelledby');
  return (id && visibleText(document.getElementById(id))) || d.getAttribute('aria-label') || visibleText(d.querySelector('h1, h2'));
}

/** Listens for focus, taps, new screens, windows and messages while the voice guide is on. */
export function VoiceGuide() {
  const on = useStore((s) => s.settings.voiceGuide);
  const t = useT();
  useEffect(() => {
    if (!on) return;
    // Keyboard and switch users: read whatever gets focus.
    const onFocus = (e: FocusEvent) => {
      const el = e.target as HTMLElement;
      if (!el.matches?.(CONTROL) || !el.matches(':focus-visible') || el.closest('[data-guide-quiet]')) return;
      guideSay(describe(el, t));
    };
    // Touch and mouse users: read the control after a tap, with its new state.
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>(CONTROL);
      if (!el || el.closest(QUIET) || (e.detail === 0 && document.activeElement === el)) return;
      setTimeout(() => {
        if (el.isConnected) guideSay(describe(el, t));
      }, 80);
    };
    // New windows, the tutorial and messages.
    const observer = new MutationObserver((records) => {
      for (const r of records) {
        for (const node of r.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          const dialog = node.matches('[role="dialog"]') ? node : node.querySelector('[role="dialog"]');
          if (dialog && !dialog.classList.contains('onboard') && !dialog.classList.contains('coach')) {
            guideSay(`${dialogTitle(dialog)}. ${t('vgWindow')}`, { page: true });
            return;
          }
          const toast = node.matches('.toast') ? node : node.querySelector('.toast');
          if (toast) guideSay(visibleText(toast), { polite: true });
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    // A new screen: read its title.
    const unsub = useStore.subscribe((s, prev) => {
      if (s.view === prev.view) return;
      setTimeout(() => {
        const title = visibleText(document.querySelector('.main h1, .main .board-title, .main .crumbs .current'));
        if (title) guideSay(title, { page: true });
      }, 120);
    });
    document.addEventListener('focusin', onFocus);
    document.addEventListener('click', onClick, true);
    return () => {
      document.removeEventListener('focusin', onFocus);
      document.removeEventListener('click', onClick, true);
      observer.disconnect();
      unsub();
    };
  }, [on, t]);
  return null;
}

/** Big on/off button for the voice guide, plus "Read again" while it is on. */
export function GuideToggle({ onReadAgain, big }: { onReadAgain?: () => void; big?: boolean }) {
  const t = useT();
  const on = useStore((s) => s.settings.voiceGuide);
  const toggle = () => {
    const next = !on;
    useStore.getState().updateSettings({ voiceGuide: next });
    if (!next) guideSay(t('voiceGuideOff'), { force: true, page: true });
    // Turning it on: the screen's own announcement follows (see useGuideAnnouncement).
  };
  return (
    <div className="guide-bar" data-guide-quiet>
      <button type="button" className={`btn ${big ? 'guide-btn' : 'btn-small'}`} aria-pressed={on} onClick={toggle}>
        <Icon name="speak" /> {on ? t('voiceGuideIsOn') : t('voiceGuideTurnOn')}
      </button>
      {on && onReadAgain && (
        <button type="button" className={`btn ${big ? '' : 'btn-small'}`} style={big ? { minHeight: 64 } : undefined} onClick={onReadAgain}>
          <Icon name="repeat" /> {t('voiceGuideAgain')}
        </button>
      )}
    </div>
  );
}

/** Read a screen's announcement when it appears, when the guide is switched on, and on request. */
export function useGuideAnnouncement(build: () => string, deps: unknown[]): () => void {
  const on = useStore((s) => s.settings.voiceGuide);
  const t = useT();
  const read = (intro = false) => {
    const text = build();
    if (text) guideSay(`${intro ? `${t('voiceGuideOn')} ` : ''}${text}`, { page: true });
  };
  useEffect(() => {
    if (!on) return;
    // Wait a moment so the new content is on screen.
    const id = setTimeout(() => read(Date.now() - turnedOnAt < 1500), 60);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, ...deps]);
  return () => read();
}

let turnedOnAt = 0;
useStore.subscribe((s, prev) => {
  if (s.settings.voiceGuide && !prev.settings.voiceGuide) turnedOnAt = Date.now();
});
