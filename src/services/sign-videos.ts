// Sign videos in the Google Play app. Play limits downloads to 200 MB, so that build leaves the
// videos out (VITE_STORE=play). Each video plays from the NZSL dictionary the first time it is
// watched and is saved on the device, so it works offline after that. Other builds carry the
// videos inside the app (Android APK) or use the service worker (website).
import { isNative } from './platform';

// The native shell provides this; importing @capacitor/core would add it to the website too.
const convertFileSrc = (uri: string) =>
  (globalThis as { Capacitor?: { convertFileSrc?: (u: string) => string } }).Capacitor?.convertFileSrc?.(uri) ?? uri;

export const streamsVideos = isNative && import.meta.env.VITE_STORE === 'play';

const DIR = 'nzsl/video';
const fs = () => import('@capacitor/filesystem');
const saving = new Map<string, Promise<boolean>>();

/** A playable URL for the saved copy of a video (e.g. "nzsl/video/2556.mp4"), if it has been saved. */
export async function savedVideoUrl(path: string): Promise<string | null> {
  const { Filesystem, Directory } = await fs();
  try {
    const { uri } = await Filesystem.stat({ path, directory: Directory.Data });
    return convertFileSrc(uri);
  } catch {
    return null;
  }
}

/** Save one video on the device. Downloads to a temporary name first, so a cut-off download is never used. */
export function saveVideo(path: string, url: string): Promise<boolean> {
  let job = saving.get(path);
  if (!job) {
    job = (async () => {
      if (await savedVideoUrl(path)) return true;
      const { Filesystem, Directory } = await fs();
      try {
        await Filesystem.downloadFile({ url, path: `${path}.part`, directory: Directory.Data, recursive: true });
        await Filesystem.rename({ from: `${path}.part`, to: path, directory: Directory.Data });
        return true;
      } catch {
        return false;
      } finally {
        saving.delete(path);
      }
    })();
    saving.set(path, job);
  }
  return job;
}

/** Save many videos, a few at a time. */
export async function saveVideos(videos: { path: string; url: string }[], onProgress: (done: number, total: number) => void) {
  let next = 0, done = 0, failed = 0;
  onProgress(0, videos.length);
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      while (next < videos.length) {
        const v = videos[next++]!;
        if (!(await saveVideo(v.path, v.url))) failed++;
        onProgress(++done, videos.length);
      }
    }),
  );
  return { total: videos.length, saved: videos.length - failed, failed };
}

export async function removeSavedVideos() {
  const { Filesystem, Directory } = await fs();
  await Filesystem.rmdir({ path: DIR, directory: Directory.Data, recursive: true }).catch(() => {});
}
