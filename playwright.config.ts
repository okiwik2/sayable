import { defineConfig, devices } from '@playwright/test';

// End-to-end tests run against the built app (as installed users get it), in Microsoft Edge.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 45_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    channel: 'msedge',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'tablet', use: { ...devices['Desktop Edge'], channel: 'msedge', viewport: { width: 1180, height: 820 }, hasTouch: true }, grepInvert: /@phone/ },
    { name: 'phone', use: { ...devices['Desktop Edge'], channel: 'msedge', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: false }, grep: /@phone/ },
  ],
  webServer: {
    command: 'npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
