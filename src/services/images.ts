// Personal photos and pictures for tiles. Stored on the device only, at two sizes:
// a small one for tiles (fast to show) and a larger one for the detail view.
import { db } from './db';
import { newId } from './repo';

export interface Crop {
  /** 0..1 offsets and size of a square crop, relative to the image */
  x: number;
  y: number;
  size: number;
}

const urlCache = new Map<string, string>();

export async function loadBitmap(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
    } catch {
      /* fall through to <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function dims(src: ImageBitmap | HTMLImageElement) {
  return 'naturalWidth' in src ? { w: src.naturalWidth, h: src.naturalHeight } : { w: src.width, h: src.height };
}

/** Draw a square crop of the image at the given size, as JPEG (photos) or PNG (drawings with transparency). */
export async function renderCrop(src: ImageBitmap | HTMLImageElement, crop: Crop, size: number, type: 'image/jpeg' | 'image/png'): Promise<Blob> {
  const { w, h } = dims(src);
  const side = Math.min(w, h) * crop.size;
  const sx = (w - side) * crop.x;
  const sy = (h - side) * crop.y;
  const canvas = document.createElement('canvas');
  const out = Math.min(size, Math.round(side));
  canvas.width = out;
  canvas.height = out;
  const ctx = canvas.getContext('2d')!;
  if (type === 'image/jpeg') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, out, out);
  }
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, sx, sy, side, side, 0, 0, out, out);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not save image'))), type, 0.85),
  );
}

export async function saveImage(profileId: string, file: Blob, crop: Crop = { x: 0.5, y: 0.5, size: 1 }): Promise<string> {
  const bmp = await loadBitmap(file);
  const type = file.type === 'image/png' || file.type === 'image/svg+xml' || file.type === 'image/gif' ? 'image/png' : 'image/jpeg';
  const [thumb, full] = await Promise.all([renderCrop(bmp, crop, 256, type), renderCrop(bmp, crop, 1024, type)]);
  const id = newId('img');
  await db.images.put({ id, profileId, thumb, full, createdAt: Date.now() });
  return id;
}

/** Save a picture fetched from elsewhere (e.g. a different ARASAAC symbol) as-is. */
export async function saveImageBlob(profileId: string, blob: Blob): Promise<string> {
  const id = newId('img');
  await db.images.put({ id, profileId, thumb: blob, full: blob, createdAt: Date.now() });
  return id;
}

export async function imageUrl(id: string, size: 'thumb' | 'full' = 'thumb'): Promise<string | null> {
  const key = `${id}:${size}`;
  if (urlCache.has(key)) return urlCache.get(key)!;
  const row = await db.images.get(id);
  if (!row) return null;
  const url = URL.createObjectURL(size === 'thumb' ? row.thumb : row.full);
  urlCache.set(key, url);
  return url;
}

export async function deleteImage(id: string) {
  for (const size of ['thumb', 'full']) {
    const url = urlCache.get(`${id}:${size}`);
    if (url) URL.revokeObjectURL(url);
    urlCache.delete(`${id}:${size}`);
  }
  await db.images.delete(id);
}

/** Remove pictures no item points to any more (e.g. after replacing a photo). */
export async function cleanupImages(profileId: string, inUse: Set<string>): Promise<number> {
  const rows = await db.images.where('profileId').equals(profileId).primaryKeys();
  let removed = 0;
  for (const id of rows) {
    if (!inUse.has(id)) {
      await deleteImage(id);
      removed++;
    }
  }
  return removed;
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const [head, body] = dataUrl.split(',');
  const mime = /data:([^;]+)/.exec(head ?? '')?.[1] ?? 'application/octet-stream';
  const bin = atob(body ?? '');
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
