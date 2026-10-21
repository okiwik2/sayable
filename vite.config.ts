/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import legacy from '@vitejs/plugin-legacy';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => ({
  // Relative base so the built app works from any folder or sub-path (e.g. GitHub Pages).
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.1.0'),
  },
  plugins: [
    react(),
    // Old iPads (iOS 10, Safari 10) can't run the modern build and show a white screen.
    // This adds a second, transpiled build that only those browsers load.
    legacy({ targets: ['safari >= 10', 'ios >= 10'], modernPolyfills: false }),
    VitePWA({
      // The native apps carry everything inside them; no service worker there.
      disable: mode === 'native',
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icons/*.png', 'icons/*.svg'],
      manifest: {
        name: 'Sayable',
        short_name: 'Sayable',
        description: 'Talk with words, symbols and sign. Works offline.',
        lang: 'en',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        background_color: '#f7f5f0',
        theme_color: '#1f4e5f',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // The app and vocabulary are stored on install. Symbol pictures are not: the service
        // worker saves files one at a time, which took minutes for ~960 pictures, so the app
        // downloads them in parallel itself (src/services/offline.ts) into the 'symbols' cache.
        globPatterns: ['**/*.{js,css,html,json,svg,woff2}', 'icons/*.png'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: 'index.html',
        // Take control of the open page on first install, so it works offline straight away.
        // Updates still wait until the user chooses to update (never mid-message).
        clientsClaim: true,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes('/symbols/'),
            handler: 'CacheFirst',
            options: { cacheName: 'symbols', matchOptions: { ignoreVary: true }, cacheableResponse: { statuses: [200] } },
          },
          {
            // Sign drawings: saved as they are viewed, or all at once from Settings.
            urlPattern: ({ url }) => url.pathname.includes('/nzsl/img/'),
            handler: 'CacheFirst',
            options: { cacheName: 'nzsl-img', expiration: { maxEntries: 5000 } },
          },
          {
            // Sign videos: saved for offline from Settings (they are large).
            urlPattern: ({ url }) => url.pathname.includes('/nzsl/video/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'nzsl-video',
              rangeRequests: true,
              cacheableResponse: { statuses: [200] },
              expiration: { maxEntries: 5000 },
            },
          },
        ],
      },
    }),
  ],
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1500,
  },
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/unit/**/*.test.tsx'],
    environment: 'node',
  },
}));
