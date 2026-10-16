import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mockSpeech, spoken, startFresh, tap } from './helpers';

test.beforeEach(async ({ page }) => {
  await mockSpeech(page);
});

const message = (page: import('@playwright/test').Page) => page.locator('.message-tokens');

test('builds "I want water" and speaks it with the chosen language voice', async ({ page }) => {
  await startFresh(page);
  await tap(page, 'I');
  await tap(page, 'want');
  await page.getByRole('button', { name: 'Topics', exact: true }).click();
  await page.locator('.tile.folder', { hasText: 'Food & drink' }).click();
  await page.locator('.tile.folder', { hasText: 'Drinks' }).click();
  await tap(page, 'water');
  await expect(message(page)).toContainText('I');
  await expect(message(page).locator('.chip')).toHaveCount(3);
  await page.getByRole('button', { name: /^Speak: / }).click();
  await expect.poll(() => spoken(page)).toEqual([expect.objectContaining({ text: 'I want water.', voice: 'Test English' })]);
});

test('undo, delete word and clear can all be reversed', async ({ page }) => {
  await startFresh(page);
  for (const w of ['I', 'want', 'more']) await tap(page, w);
  await page.getByRole('button', { name: 'Delete word' }).click();
  await expect(message(page).locator('.chip')).toHaveCount(2);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(message(page).locator('.chip')).toHaveCount(3);
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(message(page).locator('.chip')).toHaveCount(0);
  // The toast offers Undo as well.
  await page.locator('.toast').getByRole('button', { name: 'Undo' }).click();
  await expect(message(page).locator('.chip')).toHaveCount(3);
});

test('a word can be inserted in the middle and moved', async ({ page }) => {
  await startFresh(page);
  await tap(page, 'I');
  await tap(page, 'go');
  await message(page).getByRole('button', { name: 'go' }).click();
  await page.getByRole('button', { name: 'Add words before this' }).click();
  await tap(page, 'want');
  await tap(page, 'to');
  await expect(message(page).locator('.chip')).toHaveText(['I', 'want', 'to', 'go']);
  await page.getByRole('button', { name: 'Add to the end' }).click();
  await message(page).getByRole('button', { name: 'I', exact: true }).click();
  await page.getByRole('button', { name: /Move right/ }).click();
  await expect(message(page).locator('.chip')).toHaveText(['want', 'I', 'to', 'go']);
});

test('quick replies speak straight away and keep the message being built', async ({ page }) => {
  await startFresh(page);
  await tap(page, 'I');
  await tap(page, 'want');
  await page.locator('.pinned-bar').getByRole('button', { name: 'Please wait' }).click();
  await expect.poll(() => spoken(page)).toEqual([expect.objectContaining({ text: 'Please wait.' })]);
  await expect(message(page).locator('.chip')).toHaveText(['I', 'want']);
});

test('suggestions offer next words, and grammar help is optional', async ({ page }) => {
  await startFresh(page);
  await tap(page, 'I');
  await tap(page, 'want');
  await expect(page.locator('.suggest-bar').getByRole('button', { name: 'to', exact: true })).toBeVisible();
  await page.locator('.suggest-bar').getByRole('button', { name: 'to', exact: true }).click();
  await expect(message(page).locator('.chip')).toHaveText(['I', 'want', 'to']);

  // "me want go shop" -> suggestion, but the original stays until chosen
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await page.getByRole('button', { name: 'Extended: 100 words' }).count();
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  for (const w of ['me', 'want', 'go', 'shop']) {
    await page.getByLabel('Search all words').fill(w);
    await page.locator('.grid .tile').first().click();
  }
  await expect(message(page).locator('.chip')).toHaveText(['me', 'want', 'go', 'shop']);
  const box = page.locator('.grammar-box');
  await expect(box).toContainText('I want to go to the shop.');
  await box.getByRole('button', { name: 'Use this' }).click();
  await expect(message(page).locator('.chip')).toHaveText(['I', 'want', 'to', 'go', 'to', 'the', 'shop']);
});

test('search finds words by synonym and adds them', async ({ page }) => {
  await startFresh(page);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByLabel('Search all words').fill('loo');
  await expect(page.locator('.grid .tile').first()).toContainText('toilet');
  await page.locator('.grid .tile').first().click();
  await expect(message(page).locator('.chip')).toHaveText(['toilet']);
});

test('unfinished message comes back after the app is closed', async ({ page }) => {
  await startFresh(page);
  await tap(page, 'I');
  await tap(page, 'need');
  await page.waitForTimeout(500);
  await page.reload();
  await expect(message(page).locator('.chip')).toHaveText(['I', 'need']);
});

test('saved messages can be spoken again', async ({ page }) => {
  await startFresh(page);
  await tap(page, 'I');
  await tap(page, 'like');
  await tap(page, 'it');
  await page.getByLabel('Message').getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await page.getByRole('button', { name: 'Saved', exact: true }).click();
  await expect(page.locator('.list-item')).toContainText('I like it.');
  await page.locator('.list-item').getByRole('button', { name: 'Speak' }).click();
  await expect.poll(() => spoken(page)).toEqual([expect.objectContaining({ text: 'I like it.' })]);
});

test('keyboard users can move through the board with arrow keys', async ({ page }) => {
  await startFresh(page);
  const first = page.locator('.grid .tile').first();
  await first.focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(message(page).locator('.chip')).toHaveText(['you']);
  await page.keyboard.press('Control+Enter');
  await expect.poll(() => spoken(page)).toEqual([expect.objectContaining({ text: 'You.' })]);
});

test('show view displays the message in large text', async ({ page }) => {
  await startFresh(page);
  await tap(page, 'help');
  await page.getByRole('button', { name: 'Show', exact: true }).click();
  await expect(page.locator('.show-text')).toHaveText('Help.');
  await page.locator('.show-screen').getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.locator('.show-screen')).toHaveCount(0);
});

test('word details show the NZSL sign', async ({ page }) => {
  await startFresh(page);
  await page.locator('.grid .tile', { has: page.locator('.label', { hasText: /^want$/ }) }).first().click({ button: 'right' });
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Sign for “want”');
  await expect(dialog.locator('video')).toHaveAttribute('src', /nzsl\/video\/\d+\.mp4/);
  await expect(dialog).toContainText('Matched to NZSL Online');
});

test('essential words cannot be hidden', async ({ page }) => {
  await startFresh(page);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.locator('.grid .tile', { has: page.locator('.label', { hasText: /^stop$/ }) }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('always stay available');
  await expect(dialog.getByRole('button', { name: 'Hide' })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Remove from this board' })).toHaveCount(0);
});

test('a new word can be added and used', async ({ page }) => {
  await startFresh(page);
  await page.getByRole('button', { name: 'Topics', exact: true }).click();
  await page.locator('.tile.folder', { hasText: 'People' }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('button', { name: 'Add word' }).click();
  await page.getByLabel('English', { exact: true }).fill('Aunty Mere');
  await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: 'Done editing' }).click();
  await tap(page, 'Aunty Mere');
  await expect(message(page).locator('.chip')).toHaveText(['Aunty Mere']);
});

test('main screen has no serious accessibility problems', async ({ page }) => {
  await startFresh(page);
  await tap(page, 'I');
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious.map((v) => `${v.id}: ${v.nodes.length} (${v.nodes[0]?.target})`)).toEqual([]);
});

test('settings and topics have no serious accessibility problems', async ({ page }) => {
  await startFresh(page);
  for (const name of ['Settings', 'Topics']) {
    await page.getByRole('button', { name, exact: true }).click();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious.map((v) => `${name} ${v.id}: ${v.nodes.length} (${v.nodes[0]?.target})`)).toEqual([]);
  }
});
