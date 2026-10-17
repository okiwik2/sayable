import { test, expect, type Page } from '@playwright/test';
import { mockSpeech, spoken, startFresh } from './helpers';

const said = async (page: Page) => (await spoken(page)).map((s) => s.text).join(' | ');

async function openSafetySettings(page: Page) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.locator('.settings-nav').getByRole('button', { name: 'Safety and about me' }).click();
}

async function hold(page: Page, name: string, ms: number) {
  const box = (await page.getByRole('button', { name, exact: true }).last().boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
}

test('safety features are all off until switched on', async ({ page }) => {
  await mockSpeech(page);
  await startFresh(page);
  await expect(page.getByRole('button', { name: 'Emergency (hold)' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Safety', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Where does it hurt?' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Show my emergency message' }).click();
  await expect(page.getByRole('dialog', { name: 'Emergency' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Show my location' })).toHaveCount(0);
});

test('the Help button opens the emergency screen only when held, and it closes only when held', async ({ page }) => {
  await mockSpeech(page);
  await startFresh(page);
  await openSafetySettings(page);
  await page.getByRole('switch', { name: /SOS button on every screen/ }).click();
  await page.getByRole('switch', { name: /Keep repeating/ }).click();
  await page.getByRole('switch', { name: /Medical card/ }).click();
  await page.getByLabel('Medications').fill('Insulin');
  await page.getByLabel('My name').fill('Mere');

  // A quick tap only explains how it works.
  await page.getByRole('button', { name: 'Emergency (hold)' }).click();
  await expect(page.getByText('Keep holding SOS to show the emergency message.')).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Emergency' })).toHaveCount(0);

  await hold(page, 'Emergency (hold)', 1100);
  const screen = page.getByRole('dialog', { name: 'Emergency' });
  await expect(screen).toBeVisible();
  await expect(screen).toContainText('I cannot speak. Please read this message. I need help.');
  await expect(screen).toContainText('Medications: Insulin');
  await expect(screen).toContainText('My name: Mere');
  await expect.poll(() => said(page)).toContain('I cannot speak.');

  // It repeats (every 15 s by default) until stopped.
  await page.evaluate(() => ((window as unknown as { __spoken: unknown[] }).__spoken.length = 0));
  await expect.poll(() => said(page), { timeout: 20000 }).toContain('I cannot speak.');
  await screen.getByRole('button', { name: 'Stop', exact: true }).click();

  // A tap on close doesn't close it; holding does.
  await screen.getByRole('button', { name: 'Hold to close' }).click();
  await expect(screen).toBeVisible();
  await hold(page, 'Hold to close', 1100);
  await expect(screen).toHaveCount(0);
});

test('"Where does it hurt?" builds and speaks a sentence', async ({ page }) => {
  await mockSpeech(page);
  await startFresh(page);
  await openSafetySettings(page);
  await page.getByRole('switch', { name: /Where does it hurt/ }).click();
  await page.getByRole('button', { name: 'Safety', exact: true }).click();
  await page.getByRole('button', { name: 'Where does it hurt?' }).click();
  const dialog = page.getByRole('dialog', { name: 'Where does it hurt?' });
  await dialog.getByRole('button', { name: 'Stomach' }).click();
  await dialog.getByRole('radio', { name: /^7,/ }).click();
  await expect(dialog).toContainText('My stomach hurts. 7 out of 10.');
  await dialog.getByRole('button', { name: 'Speak', exact: true }).click();
  await expect.poll(() => said(page)).toContain('My stomach hurts. 7 out of 10.');
  await dialog.getByRole('button', { name: 'Add to message' }).click();
  await expect(page.locator('.message-tokens')).toContainText('My stomach hurts. 7 out of 10.');

  // It also opens from the emergency screen, on top of it.
  await page.getByRole('button', { name: 'Show my emergency message' }).click();
  await page.getByRole('dialog', { name: 'Emergency' }).getByRole('button', { name: 'Where does it hurt?' }).click();
  await page.getByRole('dialog', { name: 'Where does it hurt?' }).getByRole('button', { name: 'Head' }).click();
  await expect(page.getByRole('dialog', { name: 'Where does it hurt?' })).toContainText('My head hurts.');
});

test('with a helper PIN set, changing safety features asks for it', async ({ page }) => {
  await mockSpeech(page);
  await startFresh(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.locator('.settings-nav').getByRole('button', { name: 'Editing and helpers' }).click();
  await page.getByLabel('Set PIN').fill('2468');
  await page.getByRole('button', { name: 'Save', exact: true }).last().click();
  await page.reload();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.locator('.settings-nav').getByRole('button', { name: 'Safety and about me' }).click();
  await page.getByRole('switch', { name: /SOS button on every screen/ }).click();
  await expect(page.getByRole('dialog', { name: 'Enter the editing PIN' })).toBeVisible();
});
