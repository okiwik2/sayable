// Makes the PNG app icons from public/icons/icon.svg. Run: node scripts/make-icons.mjs
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
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
console.log('Icons written to public/icons');
