import { test, expect } from '@playwright/test';
import { mockSpeech, startFresh } from './helpers';

// Pressing and holding must never open the browser's own menu or select text, except in text fields.
test('long press opens no browser menu and selects no text, except in text fields', async ({ page }) => {
  await mockSpeech(page);
  await startFresh(page);
  const menuBlocked = (selector: string) =>
    page.locator(selector).first().evaluate((el) => {
      const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
      el.dispatchEvent(e);
      return e.defaultPrevented;
    });
  const selectable = (selector: string) => page.locator(selector).first().evaluate((el) => getComputedStyle(el).userSelect);

  for (const selector of ['.board-title', '.nav-btn', '.quick-btn', '.message-placeholder']) {
    expect(await menuBlocked(selector), selector).toBe(true);
    expect(await selectable(selector), selector).toBe('none');
  }

  // A tile's long press opens the word's details, never the browser menu.
  await page.locator('.grid .tile').first().click({ button: 'right' });
  await expect(page.getByRole('button', { name: 'Edit this word' })).toBeVisible();
  await page.keyboard.press('Escape');

  // Text fields keep their normal menu (copy, paste) and selection.
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  expect(await menuBlocked('input')).toBe(false);
  expect(await selectable('input')).toBe('text');
});
