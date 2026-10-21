import { test, expect, type Page } from '@playwright/test';
import { mockSpeech, spoken } from './helpers';

// Sayable Lite (/lite/): the small version for old devices.
const tile = (page: Page, label: string) => page.locator('#main .t', { has: page.locator('span', { hasText: new RegExp(`^${label}$`) }) }).first();

test('lite: build and speak a message from the core board', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await mockSpeech(page);
  await page.goto('/lite/');
  await expect(page.locator('#main .t')).toHaveCount(64);
  // The core board fits the screen without scrolling.
  const fits = await page.locator('#main').evaluate((el) => el.scrollHeight <= el.clientHeight + 1);
  expect(fits).toBe(true);

  await tile(page, 'I').click();
  await tile(page, 'want').click();
  await expect(page.locator('#msg .w')).toHaveText(['I', 'want']);
  await page.locator('#speak').click();
  expect((await spoken(page)).map((s) => s.text)).toEqual(['I', 'want', 'I want']);

  await page.locator('#back').click();
  await expect(page.locator('#msg .w')).toHaveText(['I']);
  await page.locator('#clear').click();
  await expect(page.locator('#msg .w')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('lite: topics, places, phrases and Mandarin', async ({ page }) => {
  await mockSpeech(page);
  await page.goto('/lite/');
  await page.locator('#nav [data-tab="topics"]').click();
  await page.locator('[data-cat="food"]').click();
  await page.locator('[data-cat="food-fruit"]').click();
  await expect(page.locator('#crumb span')).toHaveText('Fruit');
  await page.locator('#crumb button').click();
  await expect(page.locator('#crumb span')).toHaveText('Food & drink');

  await page.locator('#nav [data-tab="places"]').click();
  await page.locator('[data-board="ctx-home"]').click();
  await expect(page.locator('#main .t:not(.e)').first()).toBeVisible();

  await page.locator('#nav [data-tab="phrases"]').click();
  await expect(page.locator('#main h2').first()).toHaveText('Pinned');

  await page.locator('#nav [data-lang]').click();
  await expect(page.locator('#nav [data-tab="core"]')).toHaveText('核心词');
  await page.locator('#nav [data-tab="core"]').click();
  await page.locator('#main [data-item]').first().click();
  const last = (await spoken(page)).at(-1)!;
  expect(last.lang).toBe('zh-CN');
});

test('lite: settings are remembered', async ({ page }) => {
  await page.goto('/lite/');
  await page.locator('#nav [data-settings]').click();
  await page.locator('#sheet button', { hasText: 'More' }).click();
  await page.locator('#sheet .done').click();
  await expect(page.locator('#main .t')).toHaveCount(100);
  await page.reload();
  await expect(page.locator('#main .t')).toHaveCount(100);
});
