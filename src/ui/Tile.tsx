// Vocabulary tiles, topic folder tiles and the board grid.
import { memo, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Category, Hue, Lang, VocabItem } from '../domain/types';
import { useStore, displayText } from '../state/store';
import { symbolUrl, usePress, useSize, useStoredImage } from './hooks';
import { Icon } from './Icon';

/** Words that say "no" get the negation colour, as in the Fitzgerald key. */
const NEGATIONS = new Set([
  'not', 'no', 'dont', 'cant', 'wont', 'isnt', 'didnt', 'doesnt', 'dont-like', 'dont-know', 'dont-understand',
  'zh-mei', 'zh-bie', 'zh-buyao', 'zh-meiyou', 'zh-bushi', 'zh-bukeyi', 'stop', 'no-urgent', 'stop-urgent', 'q-no', 'q-stop',
]);

const POS_HUE: Partial<Record<VocabItem['pos'], Hue>> = {
  pron: 'yellow', verb: 'green', adj: 'blue', noun: 'orange', interj: 'pink', q: 'purple',
  adv: 'grey', prep: 'grey', conj: 'grey', det: 'grey', particle: 'grey', measure: 'grey', num: 'grey',
};

export function hueFor(item: VocabItem, coding: 'word-type' | 'category' | 'none', categories: Map<string, Category>): Hue | undefined {
  if (coding === 'none') return undefined;
  if (coding === 'word-type' && item.kind === 'word') {
    if (NEGATIONS.has(item.id)) return 'red';
    return POS_HUE[item.pos];
  }
  return categories.get(item.category)?.hue;
}

/** Rough width of the longest word in "average letters", so long words can shrink to fit. */
export function labelWidth(label: string): number {
  const longest = label.split(/s+/).reduce((m, w) => {
    let n = 0;
    for (const ch of w) n += /[　-鿿＀-￯]/.test(ch) ? 1.8 : /[mwMW]/.test(ch) ? 1.3 : /[iljtfI.,']/.test(ch) ? 0.55 : 1;
    return Math.max(m, n);
  }, 0);
  return Math.max(4, Math.round(longest * 10) / 10);
}

export function SymbolImage({ item, size = 'thumb', alt = '' }: { item: VocabItem; size?: 'thumb' | 'full'; alt?: string }) {
  const custom = item.symbol?.set === 'custom' ? String(item.symbol.id) : undefined;
  const stored = useStoredImage(custom, size);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [item.symbol?.id]);
  const src = item.symbol?.set === 'arasaac' ? symbolUrl(item.symbol.id) : stored;
  if (!src || failed) {
    // A meaningful fallback instead of a broken image: the first letter or character.
    const label = item.forms.en?.text ?? item.forms.zh?.hans ?? '?';
    return <span className="fallback" aria-hidden="true">{[...label][0]?.toUpperCase()}</span>;
  }
  return <img src={src} alt={alt} loading="lazy" decoding="async" draggable={false} onError={() => setFailed(true)} />;
}

interface TileProps {
  item: VocabItem;
  lang: Lang;
  onActivate: (item: VocabItem) => void;
  onDetails?: (item: VocabItem) => void;
  hasSign?: boolean;
  hidden?: boolean;
  extraClass?: string;
  justAdded?: boolean;
}

export const Tile = memo(function Tile({ item, lang, onActivate, onDetails, hasSign, hidden, extraClass, justAdded }: TileProps) {
  const settings = useStore((s) => s.settings);
  const categories = useStore((s) => s.vocab.categories);
  const { activation, holdMs, tileStyle, traditional, showPinyin, showSecondLanguage, commLangs, labelsOnTop, colourCoding, showSignIndicator } = settings;

  const useLang: Lang = item.forms[lang] ? lang : lang === 'en' ? 'zh' : 'en';
  const label = displayText(item, useLang, traditional);
  const other: Lang = useLang === 'en' ? 'zh' : 'en';
  let second: string | undefined;
  if (commLangs === 'both' && showSecondLanguage) {
    second = item.forms[other] ? displayText(item, other, traditional) : useLang === 'zh' ? item.forms.zh?.gloss : undefined;
  }
  const pinyin = useLang === 'zh' && showPinyin ? item.forms.zh?.pinyin : undefined;
  const hasSymbol = !!item.symbol;
  // Words without a picture are shown as clear text tiles rather than a placeholder.
  const showSym = tileStyle !== 'text' && hasSymbol;
  const showLabel = tileStyle !== 'symbol' || !hasSymbol;
  const hue = hueFor(item, colourCoding, categories);

  const { pressed, handlers } = usePress({
    activation,
    holdMs,
    onActivate: () => onActivate(item),
    onLongPress: onDetails ? () => onDetails(item) : undefined,
  });

  const zhLang = traditional ? 'zh-Hant' : 'zh-Hans';
  const accessible = [label, second, item.kind === 'phrase' ? undefined : undefined].filter(Boolean).join(', ');

  return (
    <button
      type="button"
      data-cell
      data-scan-item
      className={[
        'tile',
        item.kind === 'phrase' ? 'is-phrase' : '',
        !hasSymbol ? 'no-sym' : '',
        tileStyle === 'text' || !showSym ? 'text-only' : '',
        labelsOnTop ? 'labels-top' : '',
        pressed ? 'is-pressed' : '',
        hidden ? 'is-hidden' : '',
        justAdded ? 'is-added' : '',
        item.essential ? 'is-essential' : '',
        extraClass ?? '',
      ].join(' ')}
      data-hue={hue}
      aria-label={accessible}
      onKeyDown={(e) => {
        if (onDetails && (e.key === 'i' || e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey))) {
          e.preventDefault();
          onDetails(item);
        }
      }}
      {...handlers}
    >
      {showSym && (
        <span className="sym">
          <SymbolImage item={item} />
        </span>
      )}
      {(showLabel || pinyin || second) && (
        <span className="words">
          {showLabel && (
            <span className="label" lang={useLang === 'zh' ? zhLang : 'en'} style={{ '--chars': labelWidth(label) } as React.CSSProperties}>
              {label}
            </span>
          )}
          {pinyin && <span className="pinyin" lang="zh-Latn-pinyin">{pinyin}</span>}
          {second && (
            <span className="sub" lang={other === 'zh' ? zhLang : 'en'}>
              {second}
            </span>
          )}
        </span>
      )}
      {hasSign && showSignIndicator && (
        <span className="badge" title="Sign">
          <Icon name="hand" size={14} />
        </span>
      )}
      {item.kind === 'phrase' && (
        <span className="badge badge-left">
          <Icon name="phrase" size={13} />
        </span>
      )}
    </button>
  );
});

export function FolderTile({ category, count, onOpen, lang }: { category: Category; count?: number; onOpen: () => void; lang: Lang }) {
  const settings = useStore((s) => s.settings);
  const { pressed, handlers } = usePress({ activation: settings.activation === 'hold' ? 'release' : settings.activation, holdMs: settings.holdMs, onActivate: onOpen });
  const name = category.name[lang] ?? category.name.en;
  const second = settings.commLangs === 'both' && settings.showSecondLanguage ? category.name[lang === 'en' ? 'zh' : 'en'] : undefined;
  return (
    <button type="button" data-cell data-scan-item className={`tile folder ${pressed ? 'is-pressed' : ''}`} {...handlers}
      aria-label={`${name}${count !== undefined ? `, ${count}` : ''}`}>
      {settings.tileStyle !== 'text' && category.symbol && (
        <span className="sym">
          <img src={symbolUrl(category.symbol.id)} alt="" loading="lazy" draggable={false} />
        </span>
      )}
      <span className="words">
        <span className="label">{name}</span>
        {second && <span className="sub">{second}</span>}
      </span>
    </button>
  );
}

/**
 * The grid of tiles. Arrow keys move between tiles; only one tile is in the Tab order at a time.
 * With `fit`, rows stretch to fill the screen (like a dedicated AAC device) instead of scrolling.
 */
export function Grid({ cols: colsProp, children, fit, label }: { cols: number | ((width: number) => number); children: ReactNode[]; fit?: boolean; label: string }) {
  const [wrapRef, size] = useSize<HTMLDivElement>();
  const gridRef = useRef<HTMLDivElement>(null);
  const cols = typeof colsProp === 'function' ? colsProp(size.width) : colsProp;
  const rows = Math.max(1, Math.ceil(children.length / cols));
  const gap = 6;
  let rowH: string | undefined;
  let layout: 'row' | undefined;
  if (fit && size.height > 0) {
    const h = (size.height - gap * (rows - 1) - 8) / rows;
    const w = (size.width - gap * (cols - 1)) / cols;
    if (h >= 50 && h >= Math.min(w, 64)) rowH = `${Math.floor(h)}px`;
    // Too short to fit (small phones): keep tiles roughly square and let the board scroll a little.
    else if (w < 90) rowH = `${Math.max(60, Math.floor(w))}px`;
    // Short, wide tiles (a big board on a landscape screen): picture beside the word, so both stay large.
    if (h >= 50 && h < 96 && w / h > 1.5) layout = 'row';
  }

  // Roving tab index: keep exactly one tile tabbable.
  useEffect(() => {
    const cells = gridRef.current?.querySelectorAll<HTMLElement>('[data-cell]');
    if (!cells?.length) return;
    let active = [...cells].findIndex((c) => c.tabIndex === 0);
    if (active === -1) active = 0;
    cells.forEach((c, i) => (c.tabIndex = i === active ? 0 : -1));
  });

  const onKeyDown = (e: React.KeyboardEvent) => {
    const cells = [...(gridRef.current?.querySelectorAll<HTMLElement>('[data-cell]') ?? [])];
    const i = cells.indexOf(document.activeElement as HTMLElement);
    if (i === -1) return;
    let next = i;
    if (e.key === 'ArrowRight') next = i + 1;
    else if (e.key === 'ArrowLeft') next = i - 1;
    else if (e.key === 'ArrowDown') next = i + cols;
    else if (e.key === 'ArrowUp') next = i - cols;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = cells.length - 1;
    else return;
    e.preventDefault();
    next = Math.max(0, Math.min(cells.length - 1, next));
    cells.forEach((c, k) => (c.tabIndex = k === next ? 0 : -1));
    cells[next]?.focus();
  };

  return (
    <div className={fit ? 'grid-wrap' : 'grid-wrap is-inline'} ref={wrapRef}>
      <div
        ref={gridRef}
        className="grid"
        role="group"
        aria-label={label}
        data-scan-grid
        data-layout={layout}
        style={{ '--cols': cols, ...(rowH ? { '--row-h': rowH } : {}) } as React.CSSProperties}
        onKeyDown={onKeyDown}
        onFocus={(e) => {
          const cells = gridRef.current?.querySelectorAll<HTMLElement>('[data-cell]');
          const target = e.target as HTMLElement;
          if (cells && target.hasAttribute('data-cell')) cells.forEach((c) => (c.tabIndex = c === target ? 0 : -1));
        }}
      >
        {children}
      </div>
    </div>
  );
}

/** How many columns fit, based on the button-size setting. */
export function autoColumns(width: number, tileMin: number): number {
  return Math.max(2, Math.min(12, Math.floor((width + 6) / (tileMin + 6))));
}
