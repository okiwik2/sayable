import { test, expect } from '@playwright/test';
import { mockSpeech, spoken, startFresh, tap } from './helpers';

test('works offline once installed: board, symbols, building and speaking', async ({ page, context }) => {
  await mockSpeech(page);
  await startFresh(page);
  // Wait for the service worker to finish storing the app on the device.
  await page.waitForFunction(async () => (await navigator.serviceWorker.getRegistration())?.active?.state === 'activated', undefined, { timeout: 30000 });
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, undefined, { timeout: 10000 });
  // The app then downloads every symbol picture itself and says when it is done.
  await expect(page.getByText('Sayable is ready to use offline.')).toBeVisible({ timeout: 30000 });
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.grid .tile').first()).toBeVisible();
  // A symbol picture loads from the device.
  const img = page.locator('.grid .tile img').first();
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
  await tap(page, 'I');
  await tap(page, 'need');
  await tap(page, 'help');
  await page.getByRole('button', { name: /^Speak: / }).click();
  await expect.poll(() => spoken(page)).toEqual([expect.objectContaining({ text: 'I need help.' })]);
  // Topics and search still work.
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByLabel('Search all words').fill('water');
  await expect(page.locator('.grid .tile').first()).toContainText('water');
  // A picture that was never shown before going offline still loads.
  const waterImg = page.locator('.grid .tile img').first();
  await expect.poll(() => waterImg.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
  await context.setOffline(false);
});

test('@phone the phone layout keeps speaking and the main menu reachable', async ({ page }) => {
  await mockSpeech(page);
  await startFresh(page);
  await expect(page.locator('.nav')).toBeVisible();
  await expect(page.getByRole('button', { name: 'More', exact: true })).toBeVisible();
  await tap(page, 'I');
  await tap(page, 'want');
  await page.getByRole('button', { name: /^Speak: / }).click();
  await expect.poll(() => spoken(page)).toEqual([expect.objectContaining({ text: 'I want.' })]);
  // Nothing overflows sideways.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
