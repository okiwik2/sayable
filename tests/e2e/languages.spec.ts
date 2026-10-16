import { test, expect } from '@playwright/test';
import { mockSpeech, spoken, startFresh } from './helpers';

const message = (page: import('@playwright/test').Page) => page.locator('.message-tokens');

async function tapZh(page: import('@playwright/test').Page, label: string) {
  await page.locator('.grid .tile', { has: page.locator('.label', { hasText: new RegExp(`^${label}$`) }) }).first().click();
}

async function setTalkIn(page: import('@playwright/test').Page, option: RegExp) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('radio', { name: option }).click();
  await page.getByRole('button', { name: 'Core words', exact: true }).click();
}

test('Mandarin uses its own core board, word order and a Mandarin voice (never Cantonese)', async ({ page }) => {
  await mockSpeech(page);
  await startFresh(page);
  await setTalkIn(page, /^Mandarin/);
  for (const w of ['我', '要', '喝']) await tapZh(page, w);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByLabel('Search all words').fill('shui');
  await page.locator('.grid .tile', { has: page.locator('.label', { hasText: /^水$/ }) }).first().click();
  await expect(message(page).locator('.chip')).toHaveText(['我', '要', '喝', '水']);
  await page.getByRole('button', { name: /^说出来|^Speak/ }).first().click();
  await expect.poll(() => spoken(page)).toEqual([expect.objectContaining({ text: '我要喝水。', voice: 'Test Mandarin' })]);
});

test('pinyin shows on Mandarin tiles and can be searched with tone numbers', async ({ page }) => {
  await mockSpeech(page);
  await startFresh(page);
  await setTalkIn(page, /^Mandarin/);
  await expect(page.locator('.grid .tile', { has: page.locator('.label', { hasText: /^喜欢$/ }) }).first().locator('.pinyin')).toHaveText('xǐhuan');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByLabel('Search all words').fill('xi3huan');
  await expect(page.locator('.grid .tile').first()).toContainText('喜欢');
});

test('bilingual messages are spoken with a voice for each language', async ({ page }) => {
  await mockSpeech(page);
  await startFresh(page);
  await setTalkIn(page, /^English and Mandarin/);
  await page.locator('.grid .tile', { has: page.locator('.label', { hasText: /^I$/ }) }).first().click();
  await page.locator('.grid .tile', { has: page.locator('.label', { hasText: /^want$/ }) }).first().click();
  await page.getByRole('button', { name: '中文' }).click();
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByLabel('Search all words').fill('饺子');
  await page.locator('.grid .tile').first().click();
  await expect(message(page).locator('.chip')).toHaveCount(3);
  await page.getByRole('button', { name: /^Speak/ }).click();
  await expect.poll(() => spoken(page)).toEqual([
    expect.objectContaining({ text: 'I want', voice: 'Test English' }),
    expect.objectContaining({ text: '饺子。', voice: 'Test Mandarin' }),
  ]);
});

test('if no Mandarin voice is installed, Chinese is not read with an English voice', async ({ page }) => {
  await mockSpeech(page, { voices: [{ name: 'Test English', lang: 'en-US' }, { name: 'Test Cantonese', lang: 'zh-HK' }] });
  await startFresh(page);
  await setTalkIn(page, /^Mandarin/);
  await tapZh(page, '我');
  await page.getByRole('button', { name: /^说出来|^Speak/ }).first().click();
  await expect(page.locator('.toast')).toContainText('Mandarin');
  expect(await spoken(page)).toEqual([]);
});

test('the interface can be in Chinese while talking in English', async ({ page }) => {
  await mockSpeech(page);
  await startFresh(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('radio', { name: '中文（简体）' }).click();
  await expect(page.getByRole('button', { name: '核心词', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '核心词', exact: true }).click();
  await expect(page.locator('.grid .tile .label', { hasText: /^want$/ })).toHaveCount(1);
  await expect(page.getByRole('button', { name: '说出来' })).toBeVisible();
});
