import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { useStore } from './state/store';
import { symbolUrl } from './ui/hooks';
import { saveAllToCache, SYMBOL_CACHE } from './services/offline';
import './ui/styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

function whenVocabReady(): Promise<void> {
  return new Promise((resolve) => {
    if (useStore.getState().ready) return resolve();
    const unsub = useStore.subscribe((s) => {
      if (s.ready) {
        unsub();
        resolve();
      }
    });
  });
}

let preparing = false;
/** Save every symbol picture on the device. Runs on each start; only missing pictures are fetched. */
async function prepareOffline() {
  if (preparing || !('caches' in window) || !navigator.onLine) return;
  preparing = true;
  try {
    await navigator.serviceWorker.ready;
    await whenVocabReady();
    const { vocab } = useStore.getState();
    const urls: string[] = [];
    for (const x of [...vocab.items.values(), ...vocab.categories.values()]) {
      if (x.symbol?.set === 'arasaac') urls.push(new URL(symbolUrl(x.symbol.id), location.href).href);
    }
    const result = await saveAllToCache(SYMBOL_CACHE, urls, (done, total) =>
      useStore.setState({ offlinePrep: total && done < total ? { done, total } : null }),
    );
    useStore.setState({ offlinePrep: null });
    if (result.total > 0 && result.failed === 0) {
      useStore.getState().toast({ text: useStore.getState().t('offlineReady'), tone: 'success', ms: 5000 });
    }
  } finally {
    preparing = false;
  }
}

// Offline support: the service worker stores the app and vocabulary; prepareOffline adds the pictures.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  void prepareOffline();
  window.addEventListener('online', () => void prepareOffline());
  import('virtual:pwa-register').then(({ registerSW }) => {
    const update = registerSW({
      onNeedRefresh() {
        const st = useStore.getState();
        // Never reload while someone is building a message: offer it instead.
        st.toast({
          text: st.t('updateReady'),
          ms: 15000,
          actions: [{ label: st.t('updateNow'), run: () => void update(true) }],
        });
      },
    });
  });
}
