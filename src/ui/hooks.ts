import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import type { Activation } from '../domain/settings';
import { imageUrl } from '../services/images';

const BASE = import.meta.env.BASE_URL;

export function assetUrl(path: string): string {
  return BASE + path.replace(/^\//, '');
}

export function symbolUrl(id: number | string): string {
  return assetUrl(`symbols/arasaac/${id}.png`);
}

/** Object URL for a picture stored on the device. */
export function useStoredImage(id: string | undefined, size: 'thumb' | 'full' = 'thumb'): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (!id) {
      setUrl(null);
      return;
    }
    imageUrl(id, size).then((u) => alive && setUrl(u)).catch(() => alive && setUrl(null));
    return () => {
      alive = false;
    };
  }, [id, size]);
  return url;
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

interface PressOptions {
  activation: Activation;
  holdMs: number;
  onActivate: () => void;
  /** Long press for details (only when activation is not "hold"). */
  onLongPress?: () => void;
  longPressMs?: number;
  disabled?: boolean;
}

/**
 * Pointer handling for tiles, honouring the access settings:
 *  - release: choose on lift (normal tap; sliding off cancels)
 *  - press:   choose as soon as it is touched
 *  - hold:    choose after holding for holdMs (protects against accidental touches)
 * Keyboard and switch users get the normal button click.
 */
export function usePress({ activation, holdMs, onActivate, onLongPress, longPressMs = 650, disabled }: PressOptions) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const [pressed, setPressed] = useState(false);

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (disabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
      fired.current = false;
      start.current = { x: e.clientX, y: e.clientY };
      setPressed(true);
      if (activation === 'press') {
        fired.current = true;
        onActivate();
        return;
      }
      if (activation === 'hold') {
        timer.current = setTimeout(() => {
          fired.current = true;
          setPressed(false);
          onActivate();
        }, holdMs);
        return;
      }
      if (onLongPress) {
        timer.current = setTimeout(() => {
          fired.current = true;
          setPressed(false);
          onLongPress();
        }, longPressMs);
      }
    },
    [activation, holdMs, onActivate, onLongPress, longPressMs, disabled],
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!start.current) return;
    // A drag (e.g. scrolling) cancels the press.
    if (Math.abs(e.clientX - start.current.x) > 14 || Math.abs(e.clientY - start.current.y) > 14) {
      clear();
      setPressed(false);
      start.current = null;
      if (!fired.current) fired.current = true;
    }
  }, []);

  const end = useCallback(() => {
    clear();
    setPressed(false);
    start.current = null;
  }, []);

  const onClick = useCallback(
    (e: React.MouseEvent) => {
      if (disabled) return;
      // A real pointer press was already handled (or cancelled) above.
      if (fired.current) {
        fired.current = false;
        e.preventDefault();
        return;
      }
      // Keyboard, switch access and assistive tech send clicks with detail 0.
      if (activation === 'hold' && e.detail !== 0) return;
      onActivate();
    },
    [activation, onActivate, disabled],
  );

  useEffect(() => clear, []);

  return {
    pressed,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: end,
      onPointerCancel: end,
      onPointerLeave: end,
      onClick,
      onContextMenu: (e: React.MouseEvent) => {
        if (onLongPress) {
          e.preventDefault();
          if (!fired.current) onLongPress();
        }
      },
    },
  };
}

/** Measure an element's size (for fitting the board to the screen). */
export function useSize<T extends HTMLElement>(): [React.RefObject<T | null>, { width: number; height: number }] {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Measure before the first paint so a board never flashes at the wrong size.
    const r = el.getBoundingClientRect();
    setSize({ width: r.width, height: r.height });
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize((s) => (Math.abs(s.width - width) < 1 && Math.abs(s.height - height) < 1 ? s : { width, height }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size];
}
