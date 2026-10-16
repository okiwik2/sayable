import { test, expect, type Page } from '@playwright/test';
import { mockSpeech, spoken, startFresh } from './helpers';

const message = (page: Page) => page.locator('.message-tokens');

async function openMyWords(page: Page) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.locator('.settings-nav').getByRole('button', { name: 'My words' }).click();
}

test('words added in Settings › My words can be found, spoken, changed and deleted', async ({ page }) => {
  await mockSpeech(page);
  await startFresh(page);
  await openMyWords(page);
  await expect(page.getByText('You haven’t added any words yet.')).toBeVisible();

  await page.getByRole('button', { name: 'Add a new word' }).click();
  const editor = page.getByRole('dialog');
  await editor.getByLabel('English', { exact: true }).fill('Koro Tama');
  await editor.getByLabel('Chinese', { exact: true }).fill('爷爷');
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  // 爷爷 is already a built-in word: the app checks before saving a near-duplicate.
  await expect(page.getByRole('dialog', { name: /There is already a similar word: “爷爷”/ })).toBeVisible();
  await page.getByRole('button', { name: 'Save anyway' }).click();
  await expect(page.locator('.list-item', { hasText: 'Koro Tama' })).toContainText('Topic: People');

  // A phrase too
  await page.getByRole('button', { name: 'Add a new phrase' }).click();
  await page.getByRole('dialog').getByLabel('English', { exact: true }).fill('Can we go to the beach on Sunday?');
  await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Words you added (2)' })).toBeVisible();

  // Use it like any other word
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByLabel('Search all words').fill('koro');
  await page.locator('.grid .tile').first().click();
  await expect(message(page).locator('.chip')).toHaveText(['Koro Tama']);
  await page.getByRole('button', { name: /^Speak: / }).click();
  await expect.poll(() => spoken(page)).toEqual([expect.objectContaining({ text: 'Koro Tama.' })]);

  // Change and delete it
  await openMyWords(page);
  await page.locator('.list-item', { hasText: 'Koro Tama' }).getByRole('button', { name: 'Edit' }).click();
  await page.getByRole('dialog').getByLabel('English', { exact: true }).fill('Koro');
  await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.list-item', { hasText: 'Koro ·' })).toBeVisible();
  await page.locator('.list-item', { hasText: 'Koro ·' }).getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByRole('heading', { name: 'Words you added (1)' })).toBeVisible();
});

test('changes to built-in words are listed and can be undone', async ({ page }) => {
  await mockSpeech(page);
  await startFresh(page);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByLabel('Search all words').fill('mum');
  await page.locator('.grid .tile').first().click({ button: 'right' });
  await page.getByRole('button', { name: 'Edit this word' }).click();
  await page.getByRole('dialog').getByLabel('English', { exact: true }).fill('Mama');
  await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
  await openMyWords(page);
  const row = page.locator('.list-item', { hasText: 'Mama' });
  await expect(row).toContainText('new label');
  await row.getByRole('button', { name: 'Undo my changes' }).click();
  await expect(page.locator('.list-item', { hasText: 'Mama' })).toHaveCount(0);
});

test('when editing is locked, adding a word asks for the PIN', async ({ page }) => {
  await mockSpeech(page);
  await startFresh(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.locator('.settings-nav').getByRole('button', { name: 'Editing and helpers' }).click();
  await page.getByLabel('Set PIN').fill('2468');
  await page.getByRole('button', { name: 'Save', exact: true }).last().click();
  await page.locator('.settings-nav').getByRole('button', { name: 'My words' }).click();
  await page.getByRole('button', { name: 'Add a new word' }).click();
  const pin = page.getByRole('dialog', { name: 'Enter the editing PIN' });
  await expect(pin).toBeVisible();
  await pin.getByLabel('Enter the editing PIN').fill('1111');
  await pin.getByRole('button', { name: 'OK' }).click();
  await expect(pin).toContainText('That PIN is not right.');
  await pin.getByLabel('Enter the editing PIN').fill('2468');
  await pin.getByRole('button', { name: 'OK' }).click();
  await expect(page.getByRole('dialog', { name: 'New word' })).toBeVisible();
});
