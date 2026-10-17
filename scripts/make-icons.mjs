// Makes the PNG app icons from public/icons/icon.svg. Run: node scripts/make-icons.mjs
import sharp from 'sharp';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './lib/vocab-source.mjs';

const dir = join(ROOT, 'public', 'icons');
const svg = readFileSync(join(dir, 'icon.svg'));
await sharp(svg).resize(192, 192).png().toFile(join(dir, 'icon-192.png'));
await sharp(svg).resize(512, 512).png().toFile(join(dir, 'icon-512.png'));
await sharp(svg).resize(180, 180).flatten({ background: '#1f4e5f' }).png().toFile(join(dir, 'apple-touch-icon.png'));
// Maskable icons need the artwork inside the central safe zone, on a full-bleed background.
const inner = await sharp(svg).resize(400, 400).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: '#1f4e5f' } })
  .composite([{ input: inner, top: 56, left: 56 }])
  .png()
  .toFile(join(dir, 'icon-maskable-512.png'));
// Native app icons and splash screens: the sources @capacitor/assets turns into every Android/iOS size.
const res = join(ROOT, 'resources');
mkdirSync(res, { recursive: true });
const bg = '#1f4e5f';
await sharp(svg).resize(1024, 1024).flatten({ background: bg }).png().toFile(join(res, 'icon-only.png'));
await sharp({ create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite([{ input: await sharp(svg).resize(600, 600).png().toBuffer(), top: 212, left: 212 }])
  .png()
  .toFile(join(res, 'icon-foreground.png'));
await sharp({ create: { width: 1024, height: 1024, channels: 4, background: bg } }).png().toFile(join(res, 'icon-background.png'));
for (const name of ['splash.png', 'splash-dark.png']) {
  await sharp({ create: { width: 2732, height: 2732, channels: 4, background: bg } })
    .composite([{ input: await sharp(svg).resize(560, 560).png().toBuffer(), top: 1086, left: 1086 }])
    .png()
    .toFile(join(res, name));
}
console.log('Icons written to public/icons and resources/');
