// A short attention tone made on the device (no sound files, works offline).
let ctx: AudioContext | null = null;
let active: OscillatorNode[] = [];
let run = 0;

/** Play a two-tone beep a few times. Resolves when finished or stopped. */
export async function playAttention(times = 3): Promise<void> {
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  ctx ??= new AC();
  if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
  const id = ++run;
  const beep = 0.22;
  const start = ctx.currentTime + 0.05;
  const gain = ctx.createGain();
  gain.gain.value = 0.5;
  gain.connect(ctx.destination);
  for (let i = 0; i < times * 2; i++) {
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = i % 2 === 0 ? 880 : 660;
    osc.connect(gain);
    osc.start(start + i * (beep + 0.04));
    osc.stop(start + i * (beep + 0.04) + beep);
    active.push(osc);
  }
  const total = times * 2 * (beep + 0.04) * 1000 + 100;
  await new Promise((r) => setTimeout(r, total));
  if (id === run) active = [];
}

export function stopAttention() {
  run++;
  for (const osc of active) {
    try {
      osc.stop();
    } catch {
      /* already stopped */
    }
  }
  active = [];
}
