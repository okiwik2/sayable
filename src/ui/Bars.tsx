// Quick replies strip, language switch, suggestion bar and main navigation.
import { useMemo } from 'react';
import { useStore, useT, displayText, type View } from '../state/store';
import { primaryLang } from '../domain/settings';
import { predictNext, phrasesWith } from '../domain/predict';
import { suggestGrammar } from '../domain/grammar';
import { formatMessage } from '../domain/format';
import { tokenFor } from '../domain/sentence';
import { dataset } from '../data/dataset';
import { usePress } from './hooks';
import { Icon, type IconName } from './Icon';
import { SymbolImage } from './Tile';
import type { VocabItem } from '../domain/types';

export function QuickButton({ item, className = '' }: { item: VocabItem; className?: string }) {
  const settings = useStore((s) => s.settings);
  const speakItemNow = useStore((s) => s.speakItemNow);
  const lang = primaryLang(settings);
  const useLang = item.forms[lang] ? lang : lang === 'en' ? 'zh' : 'en';
  const label = displayText(item, useLang, settings.traditional);
  const { handlers } = usePress({ activation: settings.activation, holdMs: settings.holdMs, onActivate: () => void speakItemNow(item) });
  const tone = item.id === 'q-yes' ? 'tone-yes' : item.id === 'q-no' ? 'tone-no' : item.id === 'q-stop' ? 'tone-stop' : '';
  return (
    <button type="button" className={`quick-btn ${tone} ${className}`} data-scan-item {...handlers}
      lang={useLang === 'zh' ? (settings.traditional ? 'zh-Hant' : 'zh-Hans') : 'en'}>
      {settings.tileStyle !== 'text' && item.symbol && <SymbolImage item={item} />}
      {label}
    </button>
  );
}

export function PinnedBar() {
  const t = useT();
  const settings = useStore((s) => s.settings);
  const items = useStore((s) => s.vocab.items);
  const updateSettings = useStore((s) => s.updateSettings);
  const pinned = settings.pinned.map((id) => items.get(id)).filter(Boolean) as VocabItem[];
  if (!pinned.length && settings.commLangs !== 'both') return null;
  return (
    <div className="pinned-bar" data-scan-group>
      <div className="pinned-list" role="group" aria-label={t('pinned')}>
        {pinned.map((item) => (
          <QuickButton key={item.id} item={item} />
        ))}
      </div>
      {settings.commLangs === 'both' && (
        <div className="lang-switch" role="group" aria-label={t('addingIn')}>
          <button type="button" aria-pressed={settings.activeLang === 'en'} onClick={() => updateSettings({ activeLang: 'en' })} data-scan-item lang="en">
            English
          </button>
          <button type="button" aria-pressed={settings.activeLang === 'zh'} onClick={() => updateSettings({ activeLang: 'zh' })} data-scan-item lang="zh-Hans">
            中文
          </button>
        </div>
      )}
    </div>
  );
}

export function SuggestionBar() {
  const t = useT();
  const st = useStore();
  const { settings, message, vocab } = st;
  const lang = primaryLang(settings);

  const suggestions = useMemo(() => {
    if (!settings.predictions) return [];
    return predictNext({
      lang,
      tokens: message.tokens,
      cursor: message.cursor,
      items: vocab.items,
      seeds: dataset.predictions[lang] ?? {},
      learned: settings.learnFromMe ? st.data.bigrams : {},
      traditional: settings.traditional,
      limit: 7,
    }).filter((s) => !vocab.overrides.get(s.itemId)?.hidden);
  }, [settings.predictions, settings.learnFromMe, settings.traditional, lang, message, vocab, st.data.bigrams]);

  const lastToken = message.tokens[(message.cursor ?? message.tokens.length) - 1];
  const phrases = useMemo(() => (settings.predictions ? phrasesWith(lastToken, vocab.items, 3) : []), [lastToken, vocab, settings.predictions]);

  const grammar = useMemo(() => {
    if (!settings.grammarHelp || message.tokens.length < 2) return null;
    const s = suggestGrammar(message.tokens, (id) => vocab.items.get(id));
    if (!s) return null;
    return { tokens: s, text: formatMessage(s, settings).text };
  }, [settings, message.tokens, vocab]);

  if (!suggestions.length && !grammar && !phrases.length) {
    return settings.predictions || settings.grammarHelp ? <div className="suggest-bar" aria-hidden="true" /> : null;
  }

  return (
    <div className="suggest-bar" data-scan-group role="region" aria-label={t('suggestions')}>
      {grammar && (
        <div className="grammar-box" title={t('suggestionNote')}>
          <span className="suggest-label">{t('betterWording')}</span>
          <span className="text">{grammar.text}</span>
          <button className="btn btn-small btn-primary" onClick={() => st.replaceMessage(grammar.tokens)} data-scan-item>{t('useThis')}</button>
        </div>
      )}
      {suggestions.length > 0 && (
        <>
          <span className="suggest-label" title={t('suggestionsHint')}>{t('suggestions')}</span>
          {suggestions.map((s) => {
            const item = vocab.items.get(s.itemId)!;
            return (
              <button key={s.itemId + (s.form ?? '')} className="suggest-chip" data-scan-item
                onClick={() => st.tapItem(item, { lang, form: s.form })}
                lang={lang === 'zh' ? 'zh-Hans' : 'en'}>
                {s.text}
              </button>
            );
          })}
        </>
      )}
      {phrases.length > 0 && (
        <>
          <span className="suggest-divider" aria-hidden="true" />
          <span className="suggest-label">{t('phrasesWith', { word: lastToken?.text ?? '' })}</span>
          {phrases.map((p) => (
            <button key={p.id} className="suggest-chip is-phrase" data-scan-item onClick={() => {
              // The phrase takes the place of the word it was suggested for.
              const at = (message.cursor ?? message.tokens.length) - 1;
              const tok = tokenFor(p, p.forms[lang] ? lang : 'en', { traditional: settings.traditional });
              if (!tok || at < 0) return;
              const next = [...message.tokens];
              next[at] = tok;
              st.replaceMessage(next);
            }}>
              {displayText(p, p.forms[lang] ? lang : 'en', settings.traditional)}
            </button>
          ))}
        </>
      )}
    </div>
  );
}

const NAV: { view: View; icon: IconName; key: Parameters<ReturnType<typeof useT>>[0]; secondary?: boolean; safety?: boolean }[] = [
  { view: { screen: 'board' }, icon: 'core', key: 'navCore' },
  { view: { screen: 'topics', path: [] }, icon: 'topics', key: 'navTopics' },
  { view: { screen: 'search' }, icon: 'search', key: 'navSearch' },
  { view: { screen: 'quick' }, icon: 'quick', key: 'navQuick' },
  { view: { screen: 'favourites' }, icon: 'star', key: 'navFavourites', secondary: true },
  { view: { screen: 'saved' }, icon: 'bookmark', key: 'navSaved', secondary: true },
  { view: { screen: 'keyboard' }, icon: 'keyboard', key: 'navKeyboard', secondary: true },
  { view: { screen: 'signs' }, icon: 'hand', key: 'navSigns', secondary: true },
  { view: { screen: 'boards' }, icon: 'boards', key: 'navBoards', secondary: true },
  { view: { screen: 'safety' }, icon: 'shield', key: 'navSafety', secondary: true, safety: true },
  { view: { screen: 'settings' }, icon: 'settings', key: 'navSettings', secondary: true },
];

export function Nav({ onMore }: { onMore: () => void }) {
  const t = useT();
  const view = useStore((s) => s.view);
  const go = useStore((s) => s.go);
  const settings = useStore((s) => s.settings);
  const items = NAV.filter((n) => {
    if (settings.simplified && ['keyboard', 'boards', 'signs'].includes(n.view.screen)) return false;
    if (n.view.screen === 'signs' && settings.signLanguage === 'none') return false;
    return true;
  });
  return (
    <nav className="nav" aria-label={t('navigation')} data-tour="nav" data-scan-group>
      {items.map((n) => {
        const current = view.screen === n.view.screen;
        return (
          <button
            key={n.view.screen}
            type="button"
            className={`nav-btn ${n.secondary ? 'nav-secondary' : ''} ${n.safety ? 'is-safety' : ''}`}
            aria-current={current ? 'page' : undefined}
            data-scan-item
            onClick={() => go(n.view)}
          >
            <Icon name={n.icon} />
            {t(n.key)}
          </button>
        );
      })}
      <button type="button" className="nav-btn nav-more" onClick={onMore} data-scan-item>
        <Icon name="more" />
        {t('more')}
      </button>
    </nav>
  );
}

export function MoreMenu({ onClose }: { onClose: () => void }) {
  const t = useT();
  const go = useStore((s) => s.go);
  return (
    <div className="overlay" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={t('more')}>
        <div className="dialog-body">
          <div className="cards">
            {NAV.filter((n) => n.secondary).map((n) => (
              <button key={n.view.screen} className="card" onClick={() => { go(n.view); onClose(); }}>
                <Icon name={n.icon} size={28} />
                <h3>{t(n.key)}</h3>
              </button>
            ))}
          </div>
        </div>
        <div className="dialog-foot">
          <button className="btn" onClick={onClose}>{t('close')}</button>
        </div>
      </div>
    </div>
  );
}
