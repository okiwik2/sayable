import { test, expect } from '@playwright/test';
import { mockSpeech, startFresh, tap } from './helpers';

// Upright phone, simple layout (the default): only the essentials on screen, everything else one tap away.
test('@phone the simple phone layout keeps the board big and every action reachable', async ({ page }) => {
  await mockSpeech(page);
  await startFresh(page);

  // At least five rows of words are fully on screen.
  const tops = await page.locator('.grid .tile').evaluateAll((els) =>
    [...new Set(els.filter((e) => e.getBoundingClientRect().bottom <= innerHeight - 70).map((e) => Math.round(e.getBoundingClientRect().top)))],
  );
  expect(tops.length).toBeGreaterThanOrEqual(5);

  // One strip: quick replies while the message is empty, suggestions after a word.
  await expect(page.locator('.phone-strip').getByRole('button', { name: 'Yes' })).toBeVisible();
  await tap(page, 'I');
  await expect(page.locator('.phone-strip').getByRole('button', { name: 'Yes' })).toHaveCount(0);
  await expect(page.locator('.phone-strip .suggest-chip').first()).toBeVisible();

  // The other message tools are in the ⋯ menu.
  await page.getByRole('button', { name: 'More message tools' }).click();
  const sheet = page.getByRole('dialog', { name: 'Message' });
  for (const name of ['Undo', 'Say again', 'Hear it quietly', 'Show', 'Save', 'Clear']) {
    await expect(sheet.getByRole('button', { name, exact: true })).toBeVisible();
  }
  await sheet.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(page.locator('.message-tokens .chip')).toHaveCount(0);

  // Quick replies and the other screens are in More.
  await page.locator('.nav').getByRole('button', { name: 'More', exact: true }).click();
  for (const name of ['Quick', 'Favourites', 'Signs', 'Safety', 'Settings']) {
    await expect(page.getByRole('dialog').getByRole('button', { name, exact: true })).toBeVisible();
  }
  await page.getByRole('dialog').getByRole('button', { name: 'Settings', exact: true }).click();

  // "Everything" brings back the full toolbar.
  await page.locator('.settings-nav').getByRole('button', { name: 'Display' }).click();
  await page.getByRole('radio', { name: 'Everything' }).click();
  await expect(page.locator('.message-tools').getByRole('button', { name: 'Undo' })).toBeVisible();
});
