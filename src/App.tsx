import { useEffect, useState } from 'react';
import { useStore, useT } from './state/store';
import { MessageBar, ExpandedMessage } from './ui/MessageBar';
import { PinnedBar, SuggestionBar, Nav, MoreMenu } from './ui/Bars';
import { BoardScreen, TopicsScreen } from './ui/screens/BoardScreen';
import { SearchScreen, QuickScreen, FavouritesScreen, SavedScreen, BoardsScreen, SafetyScreen, ShowHost } from './ui/screens/Screens';
import { KeyboardScreen } from './ui/screens/KeyboardScreen';
import { SignsScreen } from './ui/screens/SignsScreen';
import { SettingsScreen } from './ui/screens/SettingsScreen';
import { ItemDetail } from './ui/Detail';
import { TileEditor, PinHost } from './ui/Editing';
import { ConfirmHost, Toasts } from './ui/common';
import { Onboarding, Tutorial } from './ui/Onboarding';
import { Scanner, Dwell } from './ui/Access';

/** Put the display settings on <html> so the CSS tokens can use them. */
function useThemeAttributes() {
  const s = useStore((st) => st.settings);
  useEffect(() => {
    const root = document.documentElement;
    if (s.theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', s.theme);
    root.dataset.palette = s.palette;
    root.dataset.density = s.density;
    root.dataset.tileSize = s.tileSize;
    root.dataset.reduceMotion = String(s.reduceMotion);
    root.dataset.simplified = String(s.simplified);
    root.style.setProperty('--text-scale', String(s.textScale));
    root.lang = s.uiLang === 'zh' ? 'zh-Hans' : 'en';
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute('content', getComputedStyle(root).getPropertyValue('--surface-2').trim() || '#ebe6dc');
  }, [s.theme, s.palette, s.density, s.tileSize, s.reduceMotion, s.simplified, s.textScale, s.uiLang]);
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = useStore.getState();
      const typing = (e.target as HTMLElement).matches?.('input, textarea, select');
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        void st.speakMessage();
      } else if (e.key === 'Escape' && st.speechStatus !== 'idle') {
        st.stopSpeech();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) {
        e.preventDefault();
        st.undo();
      } else if (e.key === 'Backspace' && !typing && !document.querySelector('.dialog')) {
        e.preventDefault();
        st.deleteLast();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

function useConnectivity() {
  useEffect(() => {
    const on = () => {
      useStore.setState({ online: true });
      useStore.getState().toast({ text: useStore.getState().t('backOnline') });
    };
    const off = () => useStore.setState({ online: false });
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
}

function Main() {
  const view = useStore((s) => s.view);
  switch (view.screen) {
    case 'topics':
      return <TopicsScreen path={view.path} />;
    case 'search':
      return <SearchScreen />;
    case 'quick':
      return <QuickScreen />;
    case 'favourites':
      return <FavouritesScreen />;
    case 'saved':
      return <SavedScreen />;
    case 'keyboard':
      return <KeyboardScreen />;
    case 'signs':
      return <SignsScreen />;
    case 'boards':
      return <BoardsScreen />;
    case 'safety':
      return <SafetyScreen />;
    case 'settings':
      return <SettingsScreen section={view.section} />;
    default:
      return <BoardScreen />;
  }
}

export function App() {
  const ready = useStore((s) => s.ready);
  const onboarded = useStore((s) => s.settings.onboarded);
  const signLanguage = useStore((s) => s.settings.signLanguage);
  const loadError = useStore((s) => s.loadError);
  const t = useT();
  const [more, setMore] = useState(false);
  useThemeAttributes();
  useShortcuts();
  useConnectivity();

  useEffect(() => {
    void useStore.getState().init();
  }, []);

  // Sign data is loaded when the app is idle, so the first screen appears straight away.
  useEffect(() => {
    if (!ready || signLanguage !== 'nzsl') return;
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 800));
    idle(() => void useStore.getState().loadSigns());
  }, [ready, signLanguage]);

  if (!ready) {
    return <div className="empty" role="status">{t('loading')}</div>;
  }

  return (
    <>
      {onboarded ? (
        <div className="app">
          <MessageBar />
          <PinnedBar />
          <SuggestionBar />
          <Nav onMore={() => setMore(true)} />
          <main className="main" id="main">
            {loadError && <p className="banner">{t('storageLow')}</p>}
            <Main />
          </main>
        </div>
      ) : (
        <Onboarding />
      )}
      {more && <MoreMenu onClose={() => setMore(false)} />}
      <ItemDetail />
      <TileEditor />
      <ExpandedMessage />
      <ShowHost />
      <Tutorial />
      <PinHost />
      <ConfirmHost />
      <Toasts />
      <Scanner />
      <Dwell />
    </>
  );
}
