// Start-up for the Android and iOS apps (Capacitor). Only loaded inside the native app.
import { useStore } from './state/store';
import { speech } from './services/speech';
import { isNewer, platform } from './services/platform';

export async function initNative() {
  const [{ createNativeEngine }, { SplashScreen }, { App }] = await Promise.all([
    import('./services/speech-native'),
    import('@capacitor/splash-screen'),
    import('@capacitor/app'),
  ]);
  speech.setEngine(createNativeEngine());
  await SplashScreen.hide().catch(() => {});

  // Android back button: close the open window, otherwise go back to Core words. Never closes the app by accident.
  void App.addListener('backButton', () => {
    const active = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector('[role="dialog"]');
    if (dialog) {
      (active && dialog.contains(active) ? active : dialog).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return;
    }
    const st = useStore.getState();
    if (st.view.screen !== 'board') st.go({ screen: 'board' });
  });

  if (platform === 'android') void checkForUpdate();
}

/** The Android app is shared as a download from GitHub; offer new versions when they appear. */
async function checkForUpdate() {
  if (!navigator.onLine) return;
  try {
    const res = await fetch('https://api.github.com/repos/okiwik2/sayable/releases/latest', { headers: { Accept: 'application/vnd.github+json' } });
    if (!res.ok) return;
    const release = (await res.json()) as { tag_name?: string; html_url?: string };
    const latest = (release.tag_name ?? '').replace(/^v/, '');
    if (!latest || !isNewer(latest, __APP_VERSION__)) return;
    const st = useStore.getState();
    st.toast({
      text: st.t('appUpdate', { version: latest }),
      ms: 15000,
      actions: [{ label: st.t('appUpdateGet'), run: () => window.open(release.html_url, '_blank') }],
    });
  } catch {
    /* offline or GitHub unreachable: try again next time */
  }
}
