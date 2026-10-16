// Downloads files into the device's offline storage, several at a time.
// The service worker saves one file at a time during install, which takes minutes for
// hundreds of pictures on a slow connection, so the app fetches them itself instead.

export const SYMBOL_CACHE = 'symbols';

export interface SaveResult {
  saved: number;
  failed: number;
  total: number;
}

export async function saveAllToCache(
  cacheName: string,
  urls: string[],
  onProgress?: (done: number, total: number) => void,
  concurrency = 12,
): Promise<SaveResult> {
  const cache = await caches.open(cacheName);
  const have = new Set((await cache.keys()).map((r) => r.url));
  const missing = [...new Set(urls)].filter((u) => !have.has(u));
  let next = 0;
  let done = 0;
  let failed = 0;
  onProgress?.(0, missing.length);
  const worker = async () => {
    while (next < missing.length) {
      const url = missing[next++]!;
      try {
        const res = await fetch(url);
        if (res.ok) await cache.put(url, res);
        else failed++;
      } catch {
        failed++;
      }
      onProgress?.(++done, missing.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, missing.length) }, worker));
  return { saved: done - failed, failed, total: missing.length };
}
