// Simple line icons drawn for this app (24×24, stroke = currentColor). Icons are always paired
// with a visible label or an accessible name; they are decorative to screen readers.
const PATHS: Record<string, string> = {
  speak: 'M4 9h4l5-4v14l-5-4H4z M16.5 8.5a5 5 0 0 1 0 7 M19 6a8.5 8.5 0 0 1 0 12',
  stop: 'M6 6h12v12H6z',
  undo: 'M9 14 4 9l5-5 M4 9h10a6 6 0 0 1 0 12h-3',
  backspace: 'M9 5h11a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H9l-6-7z M12 9l6 6 M18 9l-6 6',
  clear: 'M6 6l12 12 M18 6 6 18',
  save: 'M6 3h12v18l-6-4-6 4z',
  show: 'M3 5h18v12H3z M8 21h8 M12 17v4',
  quiet: 'M4 9h4l5-4v14l-5-4H4z M17 12h3',
  repeat: 'M17 2l3 3-3 3 M4 11V9a4 4 0 0 1 4-4h12 M7 22l-3-3 3-3 M20 13v2a4 4 0 0 1-4 4H4',
  expand: 'M4 9V4h5 M20 9V4h-5 M4 15v5h5 M20 15v5h-5',
  core: 'M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h6v6h-6z',
  topics: 'M3 6h7l2 2h9v11H3z',
  search: 'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13z M15.5 15.5 21 21',
  quick: 'M13 2 4 14h7l-1 8 9-12h-7z',
  star: 'M12 3l2.8 5.8 6.2.9-4.5 4.4 1 6.2L12 17.4 6.5 20.3l1-6.2L3 9.7l6.2-.9z',
  bookmark: 'M6 3h12v18l-6-4-6 4z',
  keyboard: 'M3 6h18v12H3z M7 10h.01 M11 10h.01 M15 10h.01 M7 14h10',
  hand: 'M8 13V5.5a1.5 1.5 0 0 1 3 0V12 M11 11V4.5a1.5 1.5 0 0 1 3 0V12 M14 12V6.5a1.5 1.5 0 0 1 3 0V14c0 4-2.5 7-6 7-2.5 0-4-1.5-5.5-3.5L3.5 14a1.6 1.6 0 0 1 2.5-2L8 14',
  boards: 'M3 4h8v7H3z M13 4h8v4h-8z M13 10h8v10h-8z M3 13h8v7H3z',
  shield: 'M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z M12 8v5 M12 16h.01',
  settings: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z M19.4 13a7.6 7.6 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.4 7.4 0 0 0-1.7-1L15 3.5h-4L10.6 6a7.4 7.4 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.6a7.6 7.6 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7.4 7.4 0 0 0 1.7 1l.4 2.5h4l.4-2.5a7.4 7.4 0 0 0 1.7-1l2.4 1 2-3.4z',
  back: 'M15 5l-7 7 7 7',
  chevron: 'M9 5l7 7-7 7',
  more: 'M5 12h.01 M12 12h.01 M19 12h.01',
  edit: 'M4 20h4L19 9l-4-4L4 16z M14 6l4 4',
  lock: 'M6 11h12v10H6z M8 11V7a4 4 0 0 1 8 0v4',
  unlock: 'M6 11h12v10H6z M8 11V7a4 4 0 0 1 7.5-2',
  plus: 'M12 5v14 M5 12h14',
  check: 'M5 12l5 5L20 7',
  play: 'M7 4l13 8-13 8z',
  pause: 'M7 4h4v16H7z M13 4h4v16h-4z',
  slow: 'M3 15c0-4 3.5-7 8-7s8 3 8 7z M19 15h2 M6 15v3 M16 15v3 M11 8V6',
  loop: 'M4 12a8 8 0 0 1 14-5.3L20 9 M20 4v5h-5 M20 12a8 8 0 0 1-14 5.3L4 15 M4 20v-5h5',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 11v6 M12 7.5h.01',
  globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M3 12h18 M12 3c3 3.5 3 14.5 0 18 M12 3c-3 3.5-3 14.5 0 18',
  person: 'M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M4 21c1-4 4.5-6 8-6s7 2 8 6',
  trash: 'M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13 M10 11v6 M14 11v6',
  left: 'M15 5l-7 7 7 7',
  right: 'M9 5l7 7-7 7',
  up: 'M5 15l7-7 7 7',
  down: 'M5 9l7 7 7-7',
  camera: 'M3 8h4l2-3h6l2 3h4v12H3z M12 10a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  image: 'M3 5h18v14H3z M3 16l5-5 4 4 3-3 6 6 M15.5 9.5h.01',
  download: 'M12 4v11 M7 10l5 5 5-5 M4 20h16',
  upload: 'M12 20V9 M7 14l5-5 5 5 M4 4h16',
  phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z',
  swap: 'M7 4 3 8l4 4 M3 8h14 M17 20l4-4-4-4 M21 16H7',
  move: 'M12 3v18 M3 12h18 M9 6l3-3 3 3 M9 18l3 3 3-3 M6 9l-3 3 3 3 M18 9l3 3-3 3',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  eyeOff: 'M3 3l18 18 M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.2 M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7a9.6 9.6 0 0 0 5.4-1.6 M9.9 9.9a3 3 0 0 0 4.2 4.2',
  flip: 'M12 3v18 M8 7 4 12l4 5 M16 7l4 5-4 5',
  copy: 'M8 8h12v12H8z M4 16V4h12',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1 M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  external: 'M14 4h6v6 M20 4l-9 9 M18 14v6H4V6h6',
  phrase: 'M4 5h16v11H9l-5 4z',
  folder: 'M3 6h7l2 2h9v11H3z',
  pin: 'M9 3h6l-1 6 4 3v2H6v-2l4-3z M12 14v7',
  history: 'M3 12a9 9 0 1 0 3-6.7L3 8 M3 3v5h5 M12 7v5l3 3',
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 24, strokeWidth = 2, filled = false }: { name: IconName | string; size?: number; strokeWidth?: number; filled?: boolean }) {
  const d = PATHS[name] ?? PATHS.info!;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {d.split(' M').map((seg, i) => (
        <path key={i} d={i === 0 ? seg : 'M' + seg} />
      ))}
    </svg>
  );
}
