// Web or native app (Android / iOS through Capacitor). The native shell injects window.Capacitor,
// so the website never has to load Capacitor's code just to find out.
type CapacitorGlobal = { isNativePlatform?: () => boolean; getPlatform?: () => string };
const cap = (globalThis as { Capacitor?: CapacitorGlobal }).Capacitor;

export const isNative: boolean = !!cap?.isNativePlatform?.();
export const platform: 'web' | 'android' | 'ios' = isNative ? ((cap?.getPlatform?.() as 'android' | 'ios') ?? 'web') : 'web';

/** Is version a newer than version b? ("1.10.0" > "1.9.9") */
export function isNewer(a: string, b: string): boolean {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

/** Which kind of device this is, for settings instructions. iPads report themselves as Macs, so touch tells them apart. */
export function deviceKind(): 'android' | 'ios' | 'windows' | 'mac' | 'other' {
  if (platform !== 'web') return platform;
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return 'android';
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Windows/.test(ua)) return 'windows';
  if (/Macintosh/.test(ua)) return 'mac';
  return 'other';
}
