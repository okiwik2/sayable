// Development helper: screenshots of many screens for visual review.
// Usage: node scripts/screenshot-tour.mjs <outDir>
import { chromium } from '@playwright/test';
import { join } from 'node:path';

const out = process.argv[2] ?? '.';
const base = process.env.BASE_URL ?? 'http://localhost:4173';
const browser = await chromium.launch({ channel: 'msedge' });
const errors = [];

async function session({ width = 1180, height = 820, scheme = 'light' } = {}) {
  const page = await browser.newPage({ viewport: { width, height }, colorScheme: scheme });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(base);
  await page.getByRole('button', { name: /Start communicating now/ }).click();
  await page.waitForTimeout(400);
  return page;
}
const tile = (page, label) => page.locator('.grid .tile', { has: page.locator('.label', { hasText: new RegExp(`^${label}$`) }) }).first();
const shot = (page, name) => page.screenshot({ path: join(out, `${name}.png`) });
const settings = async (page, section) => {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  if (section) await page.locator('.settings-nav').getByRole('button', { name: section }).click();
};

// Mandarin
let page = await session();
await settings(page);
await page.getByRole('radio', { name: /^Mandarin/ }).click();
await page.getByRole('button', { name: 'Core words', exact: true }).click();
for (const w of ['我', '想', '去']) await tile(page, w).click();
await page.waitForTimeout(300);
await shot(page, 'zh-core');
await page.close();

// Bilingual + detail with sign
page = await session();
await settings(page);
await page.getByRole('radio', { name: /^English and Mandarin/ }).click();
await page.getByRole('button', { name: 'Core words', exact: true }).click();
await tile(page, 'I').click();
await tile(page, 'want').click();
await page.getByRole('button', { name: '中文' }).click();
await page.waitForTimeout(300);
await shot(page, 'both-core');
await tile(page, '喝').click({ button: 'right' });
await page.waitForTimeout(1500);
await shot(page, 'detail-sign');
await page.close();

// Dark theme, edit mode
page = await session({ scheme: 'dark' });
await tile(page, 'I').click();
await tile(page, 'feel').click();
await shot(page, 'dark-core');
await page.getByRole('button', { name: 'Edit', exact: true }).click();
await page.waitForTimeout(200);
await shot(page, 'dark-edit');
await page.close();

// High contrast + quick + safety + keyboard + settings
page = await session();
await settings(page, 'Display');
await page.getByRole('radio', { name: 'High contrast, light' }).click();
await page.getByRole('button', { name: 'Core words', exact: true }).click();
await shot(page, 'contrast-core');
await settings(page, 'Display');
await page.getByRole('radio', { name: 'Same as this device' }).click();
await page.getByRole('button', { name: 'Quick', exact: true }).click();
await shot(page, 'quick');
await page.getByRole('button', { name: 'Safety', exact: true }).click();
await shot(page, 'safety');
await page.getByRole('button', { name: 'Keyboard', exact: true }).click();
for (const k of 'hel') await page.locator('.kb-key', { hasText: new RegExp(`^${k}$`, 'i') }).first().click();
await shot(page, 'keyboard');
await settings(page, 'Voice');
await shot(page, 'settings-voice');
await page.close();

// Phone
page = await session({ width: 390, height: 844 });
await tile(page, 'I').click();
await tile(page, 'want').click();
await shot(page, 'phone-core');
await page.close();

// Portrait tablet
page = await session({ width: 820, height: 1180 });
await shot(page, 'portrait-core');
await page.close();

console.log(errors.length ? errors.join('\n') : 'no console errors');
await browser.close();
