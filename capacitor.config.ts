import type { CapacitorConfig } from '@capacitor/cli';

// Native Android and iOS apps: the same web app (built with `npm run build:native`) inside a native shell.
const config: CapacitorConfig = {
  appId: 'nz.sayable.app',
  appName: 'Sayable',
  webDir: 'dist',
  backgroundColor: '#f4f1ea',
  android: {
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
  },
  ios: {
    contentInset: 'never',
    // No link previews or bounce when pressing and holding.
    allowsLinkPreview: false,
    scrollEnabled: false,
    backgroundColor: '#f4f1ea',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: '#1f4e5f',
      showSpinner: false,
    },
  },
};

export default config;
