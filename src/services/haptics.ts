/** A short vibration, on devices that support it. Off unless the user turns it on. */
export function vibrate(ms = 12) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* not supported */
  }
}
