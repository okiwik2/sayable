import { test, expect, type Page } from '@playwright/test';
import { mockSpeech, startFresh } from './helpers';

const message = (page: Page) => page.locator('.message-tokens');

async function openAccess(page: Page) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.locator('.settings-nav').getByRole('button', { name: 'Access' }).click();
}

test('step scanning with two switches: Enter moves, Space selects', async ({ page }) => {
  await mockSpeech(page);
  await startFresh(page);
  await openAccess(page);
  await page.getByRole('radio', { name: 'Step: two switches' }).click();
  await page.getByRole('button', { name: 'Core words', exact: true }).click();
  // Move through groups until the first row of the board is highlighted.
  for (let i = 0; i < 12; i++) {
    const firstRowLit = await page.locator('.grid .tile').first().evaluate((el) => el.classList.contains('scan-item'));
    if (firstRowLit) break;
    await page.keyboard.press('Enter');
  }
  await expect(page.locator('.grid .tile').first()).toHaveClass(/scan-item/);
  await page.keyboard.press('Space'); // choose the row
  await page.keyboard.press('Space'); // choose the first word in it
  await expect(message(page).locator('.chip')).toHaveText(['I']);
});

test('dwell: resting the pointer on a word chooses it', async ({ page }) => {
  await mockSpeech(page);
  await startFresh(page);
  await openAccess(page);
  await page.getByRole('switch', { name: /Choose by resting the pointer/ }).click();
  await page.getByRole('button', { name: 'Core words', exact: true }).click();
  const target = page.locator('.grid .tile', { has: page.locator('.label', { hasText: /^want$/ }) }).first();
  const box = (await target.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.move(box.x + box.width / 2 + 2, box.y + box.height / 2 + 2);
  await expect(message(page).locator('.chip')).toHaveText(['want'], { timeout: 4000 });
  // Staying on the same word does not choose it again.
  await page.waitForTimeout(1500);
  await expect(message(page).locator('.chip')).toHaveCount(1);
});

test('hold-to-choose ignores quick accidental touches', async ({ page }) => {
  await mockSpeech(page);
  await startFresh(page);
  await openAccess(page);
  await page.getByRole('radio', { name: 'I hold it' }).click();
  await page.getByRole('button', { name: 'Core words', exact: true }).click();
  const target = page.locator('.grid .tile', { has: page.locator('.label', { hasText: /^go$/ }) }).first();
  await target.click(); // a quick tap
  await expect(message(page).locator('.chip')).toHaveCount(0);
  const box = (await target.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + 20);
  await page.mouse.down();
  await page.waitForTimeout(600);
  await page.mouse.up();
  await expect(message(page).locator('.chip')).toHaveText(['go']);
});
