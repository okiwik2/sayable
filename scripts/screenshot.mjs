// Development helper: open the built app in Edge and save screenshots of key screens.
// Usage: node scripts/screenshot.mjs <outDir> [width] [height]
import { chromium } from '@playwright/test';
import { join } from 'node:path';

const out = process.argv[2] ?? '.';
const width = Number(process.argv[3] ?? 1180);
const height = Number(process.argv[4] ?? 820);
const base = process.env.BASE_URL ?? 'http://localhost:4173';
const scheme = process.env.SCHEME ?? 'light';

const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width, height }, colorScheme: scheme });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(base);
await page.screenshot({ path: join(out, `0-welcome-${width}.png`) });
await page.getByRole('button', { name: /Start communicating now/ }).click();
await page.waitForTimeout(600);
await page.screenshot({ path: join(out, `1-core-${width}.png`) });
for (const label of ['I', 'want', 'to', 'go']) {
  await page.locator('.grid .tile', { has: page.locator('.label', { hasText: new RegExp(`^${label}$`) }) }).first().click();
}
await page.waitForTimeout(300);
await page.screenshot({ path: join(out, `2-message-${width}.png`) });
await page.getByRole('button', { name: 'Topics', exact: true }).click();
await page.waitForTimeout(300);
await page.screenshot({ path: join(out, `3-topics-${width}.png`) });
await page.locator('.tile.folder', { hasText: 'Food & drink' }).click();
await page.waitForTimeout(300);
await page.screenshot({ path: join(out, `4-food-${width}.png`) });
console.log(errors.length ? errors.join('\n') : 'no console errors');
await browser.close();
