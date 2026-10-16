// Development helper: screenshots of the main screens on phone, tablet, laptop and desktop sizes.
// Usage: npm run build && npx vite preview --port 4173, then node scripts/screenshot-devices.mjs <outDir> [names]
import { chromium } from '@playwright/test';

const out = process.argv[2] ?? '.';
const only = process.argv[3]?.split(',');
const base = process.env.BASE_URL ?? 'http://localhost:4173/';
const devices = [
  ['phone-small', 360, 640, true], ['phone', 390, 844, true], ['phone-land', 844, 390, true],
  ['tablet-port', 820, 1180, true], ['tablet-land', 1180, 820, true],
  ['laptop-small', 1280, 720, false], ['laptop', 1366, 768, false], ['desktop', 1920, 1080, false],
];
const browser = await chromium.launch({ channel: 'msedge' });
const report = [];
for (const [name, width, height, touch] of devices) {
  if (only && !only.includes(name)) continue;
  const ctx = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch && width < 900 });
  const page = await ctx.newPage();
  const shot = (n) => page.screenshot({ path: `${out}/${name}-${n}.png` });
  // Whole-page problems: sideways scrolling, or content clipped with no way to scroll to it.
  const check = (where) => page.evaluate((where) => {
    const issues = [];
    if (document.documentElement.scrollWidth > innerWidth + 1) issues.push('page scrolls sideways');
    for (const el of document.querySelectorAll('.main, .main *, .dialog *')) {
      const cs = getComputedStyle(el);
      if (el.scrollHeight > el.clientHeight + 4 && /hidden|clip/.test(cs.overflowY) && el.clientHeight > 40 && !el.closest('.tile, .chip, .label, .message-tokens'))
        issues.push(`${where}: clipped ${el.tagName.toLowerCase()}.${[...el.classList].join('.')} (${el.scrollHeight - el.clientHeight}px hidden)`);
    }
    return issues;
  }, where);
  await page.goto(base);
  await shot('0-welcome');
  await page.getByRole('button', { name: /Start communicating now/ }).click();
  await page.waitForTimeout(600);
  await shot('1-core');
  report.push(...(await check('core')).map((i) => `${name}: ${i}`));
  const nav = async (n) => {
    const b = page.locator('.nav').getByRole('button', { name: n, exact: true });
    if (await b.isVisible()) return b.click();
    await page.getByRole('button', { name: 'More', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: n, exact: true }).click();
  };
  await page.locator('.grid .tile').nth(2).click({ button: 'right', force: true });
  await page.waitForTimeout(1200);
  await shot('2-detail');
  report.push(...(await check('detail')).map((i) => `${name}: ${i}`));
  await page.keyboard.press('Escape');
  await nav('Signs');
  await page.waitForTimeout(800);
  await shot('3-signs');
  report.push(...(await check('signs')).map((i) => `${name}: ${i}`));
  await page.locator('.main .grid .tile').nth(3).click({ force: true });
  await page.waitForTimeout(1500);
  await shot('4-signdialog');
  report.push(...(await check('sign dialog')).map((i) => `${name}: ${i}`));
  await page.keyboard.press('Escape');
  await nav('Settings');
  await page.waitForTimeout(400);
  await shot('5-settings');
  report.push(...(await check('settings')).map((i) => `${name}: ${i}`));
  await ctx.close();
}
await browser.close();
console.log(report.length ? report.join('\n') : 'No layout problems found.');
