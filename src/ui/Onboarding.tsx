// First-run setup (short, skippable) and the optional guided tour.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useStore, useT } from '../state/store';
import type { Settings } from '../domain/settings';
import { speech, voiceMatchesLang } from '../services/speech';
import { Toggle } from './common';
import { Icon } from './Icon';
import { assetUrl, symbolUrl } from './hooks';
import { GuideToggle, useGuideAnnouncement } from './VoiceGuide';

const textOf = (el: Element | null | undefined) => (el instanceof HTMLElement ? el.innerText.replace(/\s+/g, ' ').trim() : '');

function Option({ checked, onClick, title, text, quiet }: { checked: boolean; onClick: () => void; title: React.ReactNode; text?: React.ReactNode; quiet?: boolean }) {
  return (
    <button type="button" role="radio" aria-checked={checked} className="onboard-option" onClick={onClick} data-guide-quiet={quiet || undefined}>
      <strong>{title}</strong>
      {text && <span className="muted">{text}</span>}
    </button>
  );
}

const STEPS = ['welcome', 'ui', 'talk', 'look', 'size', 'voice', 'board', 'extras', 'done'] as const;

export function Onboarding() {
  const t = useT();
  const st = useStore();
  const s = st.settings;
  const [step, setStep] = useState(0);
  const [voices, setVoices] = useState(speech.listVoices());
  useEffect(() => speech.onVoicesChanged(() => setVoices(speech.listVoices())), []);
  const set = (p: Partial<Settings>) => st.updateSettings(p);
  const name = STEPS[step]!;
  const narrow = typeof window !== 'undefined' && window.innerWidth < 700;
  const finish = (tutorial: boolean) => {
    set({ onboarded: true });
    if (tutorial) useStore.setState({ tutorialStep: 0 });
  };
  const startNow = () => {
    set({ onboarded: true, coreLevel: narrow ? 'starter' : s.coreLevel });
  };

  const langs = s.commLangs === 'both' ? (['en', 'zh'] as const) : ([s.commLangs] as const);

  // Voice guide: read the step, its choices and what to do next.
  const cardRef = useRef<HTMLDivElement>(null);
  const readStep = useGuideAnnouncement(() => {
    const card = cardRef.current;
    if (!card) return '';
    const parts: string[] = [];
    if (name !== 'welcome' && name !== 'done') parts.push(t('step', { n: step, total: STEPS.length - 2 }));
    parts.push(textOf(card.querySelector('h1')));
    card.querySelectorAll(':scope > p:not([aria-live]), :scope > ul, :scope > .banner, :scope > .field > .banner').forEach((p) => parts.push(textOf(p)));
    const options = [...card.querySelectorAll('[role="radio"], [role="switch"]')];
    if (options.length) {
      parts.push(t('vgOptions', { n: options.length }));
      for (const o of options) {
        const on = o.getAttribute('aria-checked') === 'true';
        parts.push(`${textOf(o)}, ${o.getAttribute('role') === 'switch' ? (on ? t('vgOn') : t('vgOff')) : on ? t('vgSelected') : ''}`);
      }
      parts.push(t('vgChooseNext', { next: t('next'), back: t('back') }));
    }
    if (name === 'welcome') parts.push(t('vgWelcomeHint', { start: t('startNow'), setup: t('setUp') }));
    if (name === 'done') parts.push(t('vgDoneHint', { finish: t('obFinish'), tour: t('obTutorial') }));
    return parts.join('. ');
  }, [step, voices.length]);

  return (
    <div className="onboard" role="dialog" aria-modal="true" aria-labelledby="ob-title">
      <div className="onboard-card" ref={cardRef}>
        <GuideToggle big={name === 'welcome'} onReadAgain={readStep} />
        {name !== 'welcome' && name !== 'done' && (
          <p className="muted" aria-live="polite">{t('step', { n: step, total: STEPS.length - 2 })}</p>
        )}

        {name === 'welcome' && (
          <>
            <img src={assetUrl('icons/icon.svg')} alt="" width={88} height={88} style={{ borderRadius: 20 }} />
            <h1 id="ob-title">{t('welcomeTitle')}</h1>
            <ul className="list" style={{ fontSize: 'var(--fs-l)' }}>
              {(['welcome1', 'welcome2', 'welcome3'] as const).map((k, i) => (
                <li key={k} className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
                  <span style={{ color: 'var(--primary)' }}><Icon name={(['core', 'speak', 'shield'] as const)[i]!} size={28} /></span>
                  {t(k)}
                </li>
              ))}
            </ul>
            <p className="muted">{t('welcomeText')}</p>
            <div className="row" style={{ gap: 12 }}>
              <button className="btn btn-primary" style={{ minHeight: 72, fontSize: 'var(--fs-l)' }} onClick={startNow} data-autofocus>
                <Icon name="speak" /> {t('startNow')}
              </button>
              <button className="btn" style={{ minHeight: 72, fontSize: 'var(--fs-l)' }} onClick={() => setStep(1)}>
                <Icon name="settings" /> {t('setUp')}
              </button>
            </div>
            <div className="row" role="group" aria-label={t('languageLabel')}>
              <span className="muted"><Icon name="globe" size={18} /> {t('languageLabel')}</span>
              <button className="btn btn-small" aria-pressed={s.uiLang === 'en'} onClick={() => set({ uiLang: 'en' })}>English</button>
              <button className="btn btn-small" aria-pressed={s.uiLang === 'zh'} onClick={() => set({ uiLang: 'zh' })}>中文</button>
            </div>
          </>
        )}

        {name === 'ui' && (
          <>
            <h1 id="ob-title">{t('obUiLang')}</h1>
            <div className="onboard-options" role="radiogroup">
              <Option checked={s.uiLang === 'en'} onClick={() => set({ uiLang: 'en' })} title="English" />
              <Option checked={s.uiLang === 'zh'} onClick={() => set({ uiLang: 'zh' })} title="中文（简体）" />
            </div>
          </>
        )}

        {name === 'talk' && (
          <>
            <h1 id="ob-title">{t('obTalkIn')}</h1>
            <div className="onboard-options" role="radiogroup">
              <Option checked={s.commLangs === 'en'} onClick={() => set({ commLangs: 'en', activeLang: 'en' })} title={t('langEn')} text="English" />
              <Option checked={s.commLangs === 'zh'} onClick={() => set({ commLangs: 'zh', activeLang: 'zh' })} title={t('langZh')} text="普通话 · 中文" />
              <Option checked={s.commLangs === 'both'} onClick={() => set({ commLangs: 'both' })} title={t('langBoth')} text="English + 中文" />
            </div>
          </>
        )}

        {name === 'look' && (
          <>
            <h1 id="ob-title">{t('obLook')}</h1>
            <div className="onboard-options" role="radiogroup">
              {(['symbol-text', 'text', 'symbol'] as const).map((v) => (
                <Option key={v} checked={s.tileStyle === v} onClick={() => set({ tileStyle: v })}
                  title={t(v === 'symbol-text' ? 'tileSymbolText' : v === 'text' ? 'tileText' : 'tileSymbol')}
                  text={
                    <span className="tile" style={{ width: 110, height: 110, marginTop: 8, pointerEvents: 'none' }} aria-hidden="true">
                      {v !== 'text' && <span className="sym"><img src={symbolUrl(5441)} alt="" /></span>}
                      {v !== 'symbol' && <span className="label" style={v === 'text' ? { fontSize: '1.4rem' } : undefined}>{s.commLangs === 'zh' ? '要' : 'want'}</span>}
                    </span>
                  } />
              ))}
            </div>
          </>
        )}

        {name === 'size' && (
          <>
            <h1 id="ob-title">{t('obSize')}</h1>
            <div className="onboard-options" role="radiogroup">
              {(['small', 'medium', 'large', 'xlarge'] as const).map((v, i) => (
                <Option key={v} checked={s.tileSize === v} onClick={() => set({ tileSize: v, textScale: [1, 1, 1.15, 1.3][i]! })}
                  title={t((['sizeSmall', 'sizeMedium', 'sizeLarge', 'sizeXLarge'] as const)[i]!)} />
              ))}
            </div>
          </>
        )}

        {name === 'voice' && (
          <>
            <h1 id="ob-title">{t('obVoice')}</h1>
            {!voices.length && <p className="banner">{t('obVoiceNone')}</p>}
            {langs.map((lang) => {
              const list = voices.filter((v) => voiceMatchesLang(v, lang));
              return (
                <div key={lang} className="field">
                  <span className="label">{lang === 'en' ? t('englishVoice') : t('mandarinVoice')}</span>
                  {!list.length && <p className="banner">{t('noVoice', { lang: lang === 'en' ? t('langEn') : t('langZh') })} {t('noVoiceHelp')}</p>}
                  <div className="onboard-options" role="radiogroup">
                    {list.slice(0, 8).map((v) => (
                      <Option key={v.id} quiet checked={s.voices[lang] === v.id} title={v.name} text={`${v.lang}${v.local ? '' : ` · ${t('voiceOnline')}`}`}
                        onClick={() => {
                          set({ voices: { ...s.voices, [lang]: v.id } });
                          const sample = lang === 'en' ? t('voiceTest') : t('voiceTestZh');
                          void speech.speak([{ lang, text: sample, speech: sample }], { voices: { [lang]: v.id }, rate: s.rate, pitch: s.pitch, volume: s.volume });
                        }} />
                    ))}
                  </div>
                </div>
              );
            })}
          </>
        )}

        {name === 'board' && (
          <>
            <h1 id="ob-title">{t('obBoard')}</h1>
            <p className="muted">{t('obBoardHelp')}</p>
            <div className="onboard-options" role="radiogroup">
              <Option checked={s.coreLevel === 'starter'} onClick={() => set({ coreLevel: 'starter' })} title={t('coreStarter')} />
              <Option checked={s.coreLevel === 'standard'} onClick={() => set({ coreLevel: 'standard' })} title={t('coreStandard')} />
              <Option checked={s.coreLevel === 'extended'} onClick={() => set({ coreLevel: 'extended' })} title={t('coreExtended')} />
            </div>
          </>
        )}

        {name === 'extras' && (
          <>
            <h1 id="ob-title">{t('obExtras')}</h1>
            <Toggle label={t('voiceGuide')} help={t('voiceGuideHelp')} checked={s.voiceGuide} onChange={(v) => set({ voiceGuide: v })} />
            <Toggle label={t('themeContrastLight')} checked={s.theme === 'contrast-light'} onChange={(v) => set({ theme: v ? 'contrast-light' : 'system' })} />
            <Toggle label={`${t('textSize')} +`} checked={s.textScale >= 1.25} onChange={(v) => set({ textScale: v ? 1.3 : 1 })} />
            <Toggle label={t('reduceMotion')} checked={s.reduceMotion} onChange={(v) => set({ reduceMotion: v })} />
            <Toggle label={t('speakEachWord')} checked={s.speakEachWord} onChange={(v) => set({ speakEachWord: v })} />
            <Toggle label={t('simpleView')} checked={s.simplified} onChange={(v) => set({ simplified: v })} />
            <Toggle label={`${t('scanning')}: ${t('scanAuto')}`} help={t('scanHelp')} checked={s.scanMode !== 'off'} onChange={(v) => set({ scanMode: v ? 'auto' : 'off' })} />
            <Toggle label={t('signIndicator')} checked={s.signLanguage === 'nzsl'} onChange={(v) => set({ signLanguage: v ? 'nzsl' : 'none' })} />
          </>
        )}

        {name === 'done' && (
          <>
            <h1 id="ob-title">{t('obDone')}</h1>
            <p style={{ fontSize: 'var(--fs-l)' }}>{t('obDoneText')}</p>
            <div className="row" style={{ gap: 12 }}>
              <button className="btn btn-primary" style={{ minHeight: 64 }} onClick={() => finish(false)}>{t('obFinish')}</button>
              <button className="btn" style={{ minHeight: 64 }} onClick={() => finish(true)}><Icon name="info" /> {t('obTutorial')}</button>
            </div>
          </>
        )}

        {name !== 'welcome' && name !== 'done' && (
          <div className="onboard-nav">
            <button className="btn" onClick={() => setStep(step - 1)}><Icon name="back" /> {t('back')}</button>
            <div className="row">
              <button className="btn" onClick={startNow}>{t('skip')}</button>
              <button className="btn btn-primary" onClick={() => setStep(step + 1)}>{t('next')} <Icon name="chevron" /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const TOUR: { target: string; text: 'tut1' | 'tut2' | 'tut3' | 'tut4' | 'tut5' | 'tut6' }[] = [
  { target: 'board', text: 'tut1' },
  { target: 'message', text: 'tut2' },
  { target: 'speak', text: 'tut3' },
  { target: 'tools', text: 'tut4' },
  { target: 'nav', text: 'tut5' },
  { target: 'edit', text: 'tut6' },
];

/** A skippable, silent guided tour that points at each part of the screen. */
export function Tutorial() {
  const t = useT();
  const step = useStore((s) => s.tutorialStep);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const current = step !== null ? TOUR[step] : undefined;
  useGuideAnnouncement(() => (current && step !== null ? `${step + 1} / ${TOUR.length}. ${t(current.text)}` : ''), [step]);
  useLayoutEffect(() => {
    if (!current) return;
    const measure = () => setRect(document.querySelector(`[data-tour="${current.target}"]`)?.getBoundingClientRect() ?? null);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [current]);
  if (step === null || !current) return null;
  const end = () => {
    useStore.setState({ tutorialStep: null });
    useStore.getState().updateSettings({ tutorialDone: true });
  };
  const last = step === TOUR.length - 1;
  const cardTop = rect ? (rect.bottom + 220 < window.innerHeight ? rect.bottom + 12 : Math.max(12, rect.top - 220)) : window.innerHeight / 3;
  const cardLeft = rect ? Math.min(Math.max(12, rect.left), window.innerWidth - 440) : 24;
  return (
    <div className="coach" role="dialog" aria-modal="true" aria-label={t('sTutorial')}>
      {rect && <div className="coach-hole" style={{ top: rect.top - 4, left: rect.left - 4, width: rect.width + 8, height: rect.height + 8 }} />}
      <div className="coach-card" style={{ top: cardTop, left: Math.max(12, cardLeft) }}>
        <p>{t(current.text)}</p>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="muted">{step + 1} / {TOUR.length}</span>
          <div className="row">
            <button className="btn" onClick={end}>{t('skip')}</button>
            {step > 0 && <button className="btn" onClick={() => useStore.setState({ tutorialStep: step - 1 })}>{t('back')}</button>}
            <button className="btn btn-primary" autoFocus onClick={() => (last ? end() : useStore.setState({ tutorialStep: step + 1 }))}>
              {last ? t('tutDone') : t('next')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
