import { test, expect, type Page } from '@playwright/test';
import { mockSpeech, startFresh } from './helpers';

// Phones, tablets, laptops and desktops: every list scrolls, the sign viewer's controls are on
// screen, every menu item can be reached, and nothing makes the page scroll sideways.
const SIZES: [string, number, number][] = [
  ['small phone', 360, 640],
  ['phone', 390, 844],
  ['phone on its side', 844, 390],
  ['tablet upright', 820, 1180],
  ['small laptop', 1280, 720],
  ['laptop', 1366, 768],
  ['desktop', 1920, 1080],
];

async function openFromMenu(page: Page, name: string) {
  const direct = page.locator('.nav').getByRole('button', { name, exact: true });
  if (await direct.isVisible()) return direct.click();
  await page.locator('.nav').getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name, exact: true }).click();
}

const noSidewaysScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);

for (const [name, width, height] of SIZES) {
  test(`${name} (${width}×${height}): signs are usable and nothing is cut off`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await mockSpeech(page);
    await startFresh(page);
    expect(await noSidewaysScroll(page)).toBeLessThanOrEqual(1);

    // The core board fits the screen without scrolling (small phones may scroll a little instead of squashing tiles).
    if (width >= 390 && height >= 700) {
      const overflow = await page.locator('.main .grid-wrap').first().evaluate((el) => el.scrollHeight - el.clientHeight);
      expect(overflow, 'core board scrolls').toBeLessThanOrEqual(2);
    }

    // Every visible menu item is fully on screen.
    for (const button of await page.locator('.nav .nav-btn:visible').all()) {
      await expect(button).toBeInViewport({ ratio: 1 });
    }

    // The signs list scrolls with the page, and its tiles are a usable size.
    await openFromMenu(page, 'Signs');
    const screen = page.locator('.main .screen');
    const tiles = page.locator('.main .grid .tile');
    await expect(tiles.first()).toBeVisible();
    expect((await tiles.first().boundingBox())!.height).toBeGreaterThanOrEqual(64);
    const scrolled = await screen.evaluate((el) => {
      const before = el.scrollTop;
      el.scrollBy(0, 400);
      return el.scrollTop - before;
    });
    expect(scrolled).toBeGreaterThan(0);
    await expect(tiles.nth(20)).toBeVisible();
    expect(await noSidewaysScroll(page)).toBeLessThanOrEqual(1);

    // The sign viewer shows the video and its buttons without scrolling.
    await screen.evaluate((el) => el.scrollTo(0, 0));
    await tiles.nth(3).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.locator('video')).toBeInViewport();
    for (const label of ['Play again', 'Slow', 'Repeat']) {
      await expect(dialog.getByRole('button', { name: label })).toBeInViewport({ ratio: 1 });
    }
    await expect(dialog.locator('.dialog-foot').getByRole('button', { name: 'Close', exact: true })).toBeInViewport({ ratio: 1 });
    expect(await noSidewaysScroll(page)).toBeLessThanOrEqual(1);
    await dialog.locator('.dialog-foot').getByRole('button', { name: 'Close', exact: true }).click();

    // Settings opens and its sections can be reached.
    await openFromMenu(page, 'Settings');
    await expect(page.locator('.settings-nav').getByRole('button', { name: 'Access' })).toBeVisible();

    // With the SOS button switched on, it is fully on screen next to Speak.
    await page.locator('.settings-nav').getByRole('button', { name: 'Safety and about me' }).click();
    await page.getByRole('switch', { name: /SOS button on every screen/ }).click();
    await expect(page.getByRole('button', { name: 'Emergency (hold)' })).toBeInViewport({ ratio: 1 });
    await expect(page.locator('.speak-btn')).toBeInViewport({ ratio: 1 });
    expect(await noSidewaysScroll(page)).toBeLessThanOrEqual(1);
  });
}
