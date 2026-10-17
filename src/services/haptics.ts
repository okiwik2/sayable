import { isNative } from './platform';

/** A short vibration, on devices that support it. Off unless the user turns it on. */
export function vibrate(ms = 12) {
  if (isNative) {
    // iPhone and iPad have no web vibration; the app uses the device's own haptics.
    void import('@capacitor/haptics')
      .then(({ Haptics, ImpactStyle }) => Haptics.impact({ style: ms > 20 ? ImpactStyle.Medium : ImpactStyle.Light }))
      .catch(() => {});
    return;
  }
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* not supported */
  }
}
