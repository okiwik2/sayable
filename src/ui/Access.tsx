// Alternative access: switch scanning and dwell (rest-to-select) for head pointers and eye gaze.
// Switches usually send key presses, so scanning is driven by keys:
//   Space = select. Step scanning: Enter = move to the next item. Escape = back to groups.
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../state/store';

type Group = { el?: Element; items: HTMLElement[] };

const visible = (el: Element) => {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight;
};

/** Groups to scan: rows of the board grid, then each toolbar or strip, in screen order. */
function collectGroups(): Group[] {
  const dialog = [...document.querySelectorAll('.dialog, .show-screen, .onboard, .coach-card')].at(-1);
  const root: ParentNode = dialog ?? document;
  const groups: Group[] = [];
  const enabled = (els: Iterable<Element>) =>
    [...els].filter((e): e is HTMLElement => e instanceof HTMLElement && !(e as HTMLButtonElement).disabled && visible(e));

  if (dialog) {
    const items = enabled(dialog.querySelectorAll('button, a[href], input, select'));
    // In a dialog, scan in rows of up to 6.
    for (let i = 0; i < items.length; i += 6) groups.push({ items: items.slice(i, i + 6) });
    return groups;
  }
  for (const el of root.querySelectorAll('[data-scan-group], [data-scan-grid]')) {
    if (!visible(el)) continue;
    if (el.hasAttribute('data-scan-grid')) {
      const cells = enabled(el.querySelectorAll('[data-cell]'));
      const rows = new Map<number, HTMLElement[]>();
      for (const c of cells) {
        const top = Math.round(c.getBoundingClientRect().top);
        rows.set(top, [...(rows.get(top) ?? []), c]);
      }
      for (const row of [...rows.entries()].sort((a, b) => a[0] - b[0])) groups.push({ items: row[1] });
    } else {
      const items = enabled(el.querySelectorAll('[data-scan-item]'));
      if (items.length) groups.push({ el, items });
    }
  }
  // Main content first (it is where most choices are), then the bars.
  return groups;
}

export function Scanner() {
  const mode = useStore((s) => s.settings.scanMode);
  const speedMs = useStore((s) => s.settings.scanMs);
  const state = useRef<{ groups: Group[]; g: number; i: number; level: 'group' | 'item' }>({ groups: [], g: -1, i: -1, level: 'group' });

  useEffect(() => {
    if (mode === 'off') return;
    const clearMarks = () => {
      document.querySelectorAll('.scan-group').forEach((e) => e.classList.remove('scan-group'));
      document.querySelectorAll('.scan-item').forEach((e) => e.classList.remove('scan-item'));
    };
    const paint = () => {
      clearMarks();
      const s = state.current;
      const group = s.groups[s.g];
      if (!group) return;
      if (s.level === 'group') {
        if (group.el) group.el.classList.add('scan-group');
        else group.items.forEach((e) => e.classList.add('scan-item'));
        (group.el as HTMLElement | undefined)?.scrollIntoView?.({ block: 'nearest' });
        group.items[0]?.scrollIntoView?.({ block: 'nearest' });
      } else {
        const item = group.items[s.i];
        item?.classList.add('scan-item');
        item?.focus({ preventScroll: false });
      }
    };
    const advance = () => {
      const s = state.current;
      if (s.level === 'group') {
        s.groups = collectGroups();
        s.g = s.groups.length ? (s.g + 1) % s.groups.length : -1;
      } else {
        const group = s.groups[s.g];
        if (!group) return;
        s.i += 1;
        // After the last item, go back to choosing a group.
        if (s.i >= group.items.length) {
          s.level = 'group';
          s.i = -1;
        }
      }
      paint();
    };
    const select = () => {
      const s = state.current;
      const group = s.groups[s.g];
      if (!group) {
        advance();
        return;
      }
      if (s.level === 'group') {
        if (group.items.length === 1) {
          group.items[0]!.click();
          reset();
          return;
        }
        s.level = 'item';
        s.i = 0;
        paint();
        return;
      }
      group.items[s.i]?.click();
      reset();
    };
    const reset = () => {
      state.current = { groups: collectGroups(), g: -1, i: -1, level: 'group' };
      setTimeout(advance, 50);
    };
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.matches('input, textarea, select')) return;
      if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        e.stopPropagation();
        select();
      } else if (e.key === 'Enter' && mode === 'step') {
        e.preventDefault();
        e.stopPropagation();
        advance();
      } else if (e.key === 'Escape' && state.current.level === 'item') {
        e.preventDefault();
        state.current.level = 'group';
        paint();
      }
    };
    window.addEventListener('keydown', onKey, true);
    reset();
    const timer = mode === 'auto' ? setInterval(advance, speedMs) : null;
    return () => {
      window.removeEventListener('keydown', onKey, true);
      if (timer) clearInterval(timer);
      clearMarks();
    };
  }, [mode, speedMs]);
  return null;
}

/** Dwell: resting a mouse-type pointer on a button for a while presses it. */
export function Dwell() {
  const on = useStore((s) => s.settings.dwell);
  const ms = useStore((s) => s.settings.dwellMs);
  const [ring, setRing] = useState<{ x: number; y: number; started: number } | null>(null);
  const [, tick] = useState(0);

  useEffect(() => {
    if (!on) return;
    let target: HTMLElement | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let fired: HTMLElement | null = null;
    let raf = 0;
    const cancel = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      target = null;
      setRing(null);
      cancelAnimationFrame(raf);
    };
    const animate = () => {
      tick((n) => n + 1);
      raf = requestAnimationFrame(animate);
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
      const el = (e.target as HTMLElement).closest<HTMLElement>('button:not(:disabled), a[href], [role="button"]');
      if (el !== fired) fired = null;
      if (el === target) {
        setRing((r) => (r ? { ...r, x: e.clientX, y: e.clientY } : r));
        return;
      }
      cancel();
      if (!el || el === fired) return;
      target = el;
      setRing({ x: e.clientX, y: e.clientY, started: performance.now() });
      raf = requestAnimationFrame(animate);
      timer = setTimeout(() => {
        const t = target;
        cancel();
        if (t) {
          fired = t; // must leave before it can fire again
          t.click();
        }
      }, ms);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerdown', cancel);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', cancel);
      cancel();
    };
  }, [on, ms]);

  if (!on || !ring) return null;
  const progress = Math.min(1, (performance.now() - ring.started) / ms);
  const c = 2 * Math.PI * 18;
  return (
    <svg className="dwell-ring" style={{ left: ring.x, top: ring.y }} viewBox="0 0 44 44" aria-hidden="true">
      <circle cx="22" cy="22" r="18" strokeDasharray={`${c * progress} ${c}`} transform="rotate(-90 22 22)" />
    </svg>
  );
}
