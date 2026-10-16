import { test, expect, type Page } from '@playwright/test';
import { mockSpeech, spoken } from './helpers';

const said = async (page: Page) => (await spoken(page)).map((s) => s.text).join(' | ');
const clearSaid = (page: Page) => page.evaluate(() => ((window as unknown as { __spoken: unknown[] }).__spoken.length = 0));

test('the voice guide reads setup aloud, step by step, and can be switched off', async ({ page }) => {
  await mockSpeech(page);
  await page.goto('/');
  // Off by default: nothing is read.
  await page.waitForTimeout(300);
  expect(await said(page)).toBe('');

  await page.getByRole('button', { name: /Turn on voice guide/ }).click();
  await expect.poll(() => said(page)).toContain('Voice guide on');
  await expect.poll(() => said(page)).toContain('Welcome to Sayable');
  await expect.poll(() => said(page)).toContain('To start straight away, tap “Start communicating now”');

  // Each step is read with its choices and what to do next.
  await clearSaid(page);
  await page.getByRole('button', { name: 'Set it up for me' }).click();
  await expect.poll(() => said(page)).toContain('Step 1 of 7');
  await expect.poll(() => said(page)).toContain('Which language for buttons and menus?');
  await expect.poll(() => said(page)).toContain('2 choices');
  await expect.poll(() => said(page)).toContain('English, selected');

  // Tapping a choice reads it with its new state.
  await page.getByRole('button', { name: 'Next' }).click();
  await clearSaid(page);
  await page.getByRole('radio', { name: /English and Mandarin/ }).click();
  await expect.poll(() => said(page)).toContain('English and Mandarin');
  await expect.poll(() => said(page)).toMatch(/selected/);

  // Chinese text is read with a Mandarin voice, English with an English voice.
  await clearSaid(page);
  await page.getByRole('button', { name: 'Read again' }).click();
  await expect.poll(async () => (await spoken(page)).some((s) => s.lang.startsWith('zh'))).toBe(true);
  expect((await spoken(page)).filter((s) => /[一-鿿]/.test(s.text)).every((s) => s.lang.startsWith('zh'))).toBe(true);

  // Keyboard users hear what they move to.
  await clearSaid(page);
  await page.keyboard.press('Tab');
  await expect.poll(() => said(page)).not.toBe('');

  // It stays on after setup and can be switched off in Settings › Access.
  await page.getByRole('button', { name: 'Skip' }).click();
  await clearSaid(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect.poll(() => said(page)).toContain('Settings');
  await page.locator('.settings-nav').getByRole('button', { name: 'Access' }).click();
  const toggle = page.getByRole('switch', { name: /Voice guide/ });
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await clearSaid(page);
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await page.waitForTimeout(400);
  await clearSaid(page);
  await page.locator('.settings-nav').getByRole('button', { name: 'Display' }).click();
  await page.waitForTimeout(400);
  expect(await said(page)).toBe('');
});

test('the voice guide does not interrupt word tiles or the message', async ({ page }) => {
  await mockSpeech(page);
  await page.goto('/');
  await page.getByRole('button', { name: /Turn on voice guide/ }).click();
  await page.getByRole('button', { name: /Start communicating now/ }).click();
  await page.waitForTimeout(800);
  await clearSaid(page);
  await page.locator('.grid .tile').first().click();
  await page.waitForTimeout(400);
  expect(await said(page)).toBe('');
});
