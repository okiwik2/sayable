import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { useStore } from './state/store';
import './ui/styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Offline support: the service worker stores the app, vocabulary and symbols on the device.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  import('virtual:pwa-register').then(({ registerSW }) => {
    const update = registerSW({
      onOfflineReady() {
        useStore.getState().toast({ text: useStore.getState().t('offlineReady'), tone: 'success', ms: 4000 });
      },
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
