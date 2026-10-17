// The main communication board (core words or a chosen board) and the topic browser.
import { useMemo, useState } from 'react';
import { useStore, useT, signsFor, displayText } from '../../state/store';
import { dataset } from '../../data/dataset';
import { primaryLang, activeLangs } from '../../domain/settings';
import { coreBoardId, resolveBoard, itemsInCategory, childCategories, isHidden } from '../../domain/vocabulary';
import type { Board, VocabItem } from '../../domain/types';
import { Tile, FolderTile, Grid, autoColumns } from '../Tile';
import { Icon } from '../Icon';
import { Dialog } from '../common';
import { EditTileMenu, BoardMenu, requestEdit, WordPicker } from '../Editing';

export const TILE_MIN: Record<string, number> = { small: 84, medium: 104, large: 136, xlarge: 176 };

export function useCurrentBoard(): Board | undefined {
  const settings = useStore((s) => s.settings);
  const view = useStore((s) => s.view);
  const userBoards = useStore((s) => s.userBoards);
  const lang = primaryLang(settings);
  const core = coreBoardId(lang, settings.coreLevel);
  // Core words unless a place board (school, doctor...) was chosen on purpose from Boards.
  const id = (view.screen === 'board' ? view.boardId : null) ?? core;
  return resolveBoard(id, dataset.boards, userBoards) ?? resolveBoard(core, dataset.boards, userBoards);
}

const openDetails = (item: VocabItem) => useStore.setState({ detailItemId: item.id });

export function BoardScreen() {
  const t = useT();
  const st = useStore();
  const { settings, vocab, editMode, moveFrom } = st;
  const board = useCurrentBoard();
  const lang = primaryLang(settings);
  const [editCell, setEditCell] = useState<{ itemId: string; index: number } | null>(null);
  const [pickCell, setPickCell] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const recent = useMemo(() => {
    if (!settings.showRecentRow) return [];
    return Object.entries(st.data.usage)
      .sort((a, b) => b[1].last - a[1].last)
      .map(([id]) => vocab.items.get(id))
      .filter((i): i is VocabItem => !!i && !!i.forms[lang] && !i.core && !isHidden(vocab, i.id))
      .slice(0, 10);
  }, [settings.showRecentRow, st.data.usage, vocab, lang]);

  if (!board) return <div className="empty">{t('loading')}</div>;

  const tileMin = TILE_MIN[settings.tileSize] ?? 104;
  const colsFor = (width: number) => {
    const c = settings.columns || board.cols;
    // On a narrow screen a wide layout would make tiles too small, so let it flow into fewer columns.
    return width && width / c < 50 ? autoColumns(width, Math.min(tileMin, 72)) : c;
  };
  const isCore = board.kind === 'core';
  const name = board.name[settings.uiLang] ?? board.name.en;
  const tap = (item: VocabItem) => st.tapItem(item);

  const onCell = (index: number) => {
    if (moveFrom !== null) {
      const next = [...board.cells];
      [next[moveFrom], next[index]] = [next[index] ?? null, next[moveFrom] ?? null];
      void st.saveBoard({ ...board, cells: next }, `Moved a word on “${board.name.en}”`);
      useStore.setState({ moveFrom: null });
      return;
    }
    if (editMode && !board.cells[index]) setPickCell(index);
  };

  const children = board.cells.map((id, index) => {
    const item = id ? vocab.items.get(id) : undefined;
    if (!item) {
      if (!editMode) return <div key={`e${index}`} className="tile is-empty" aria-hidden="true" />;
      return (
        <button key={`e${index}`} type="button" data-cell className={`tile is-empty ${moveFrom !== null ? 'is-move-target' : ''}`}
          onClick={() => onCell(index)} aria-label={moveFrom !== null ? t('moveTo') : t('addHere')}>
          <span className="label"><Icon name={moveFrom !== null ? 'move' : 'plus'} /></span>
        </button>
      );
    }
    const hidden = isHidden(vocab, item.id);
    // Hidden words leave a gap so that every other word stays in its usual place.
    if (hidden && !editMode) return <div key={`h${index}`} className="tile is-empty" aria-hidden="true" />;
    if (moveFrom !== null) {
      return (
        <button key={`m${index}`} type="button" data-cell className={`tile ${index === moveFrom ? 'is-move-src' : 'is-move-target'}`}
          onClick={() => onCell(index)} aria-label={`${t('moveTo')}: ${displayText(item, item.forms[lang] ? lang : 'en', settings.traditional)}`}>
          <span className="label">{displayText(item, item.forms[lang] ? lang : 'en', settings.traditional)}</span>
        </button>
      );
    }
    return (
      <Tile
        key={`${id}-${index}`}
        item={item}
        lang={lang}
        hidden={hidden}
        hasSign={!!st.signPack && signsFor(item.id, st).length > 0}
        onActivate={editMode ? () => setEditCell({ itemId: item.id, index }) : tap}
        onDetails={openDetails}
      />
    );
  });

  return (
    <section className="screen" aria-labelledby="board-title" data-tour="board">
      <div className="board-head">
        <h1 className="board-title" id="board-title">
          {name}
          {board.locked && <span className="tag"><Icon name="lock" size={14} /> {t('boardLocked')}</span>}
        </h1>
        <div className="board-actions">
          {editMode && (
            <button className="btn btn-small" onClick={() => setMenuOpen(true)}>
              <Icon name="more" /> {t('more')}
            </button>
          )}
          <EditToggle board={board} />
        </div>
      </div>
      {editMode && <EditBanner />}
      {moveFrom !== null && (
        <div className="banner info" role="status">
          {t('moveHere')}
          <button className="btn btn-small" onClick={() => useStore.setState({ moveFrom: null })}>{t('cancel')}</button>
        </div>
      )}
      {recent.length > 0 && !editMode && (
        <div className="recent-row" role="group" aria-label={t('historyTitle')}>
          {recent.map((item) => <Tile key={item.id} item={item} lang={lang} onActivate={tap} onDetails={openDetails} />)}
        </div>
      )}
      <Grid cols={colsFor} fit={isCore || board.cells.length <= board.cols * 6} label={name}>
        {children}
      </Grid>
      {editCell && <EditTileMenu itemId={editCell.itemId} board={board} cellIndex={editCell.index} onClose={() => setEditCell(null)} />}
      {pickCell !== null && (
        <WordPicker
          onClose={() => setPickCell(null)}
          onPick={(item) => {
            const next = [...board.cells];
            next[pickCell] = item.id;
            void st.saveBoard({ ...board, cells: next }, `Added “${item.forms.en?.text ?? item.forms.zh?.hans}” to “${board.name.en}”`);
            setPickCell(null);
          }}
        />
      )}
      {menuOpen && <BoardMenu board={board} onClose={() => setMenuOpen(false)} />}
    </section>
  );
}

export function EditToggle({ board }: { board?: Board }) {
  const t = useT();
  const editMode = useStore((s) => s.editMode);
  if (editMode) {
    return (
      <button className="btn btn-primary" onClick={() => useStore.setState({ editMode: false, moveFrom: null })}>
        <Icon name="check" /> {t('doneEditing')}
      </button>
    );
  }
  return (
    <button className="btn btn-small" onClick={() => void requestEdit(board)} data-tour="edit" aria-label={t('editBoard')}>
      <Icon name="edit" /> <span className="edit-label">{t('editBoard')}</span>
    </button>
  );
}

function EditBanner() {
  const t = useT();
  return (
    <div className="edit-banner" role="status">
      <Icon name="edit" /> {t('editing')}
      <span className="small">{t('essentialNote')}</span>
    </div>
  );
}

// ---------------- Topics ----------------

export function TopicsScreen({ path }: { path: string[] }) {
  const t = useT();
  const st = useStore();
  const { settings, vocab, editMode } = st;
  const lang = primaryLang(settings);
  const langs = activeLangs(settings);
  const [editId, setEditId] = useState<string | null>(null);
  const [catMenu, setCatMenu] = useState(false);

  const current = path.at(-1) ?? null;
  const prefs = st.data.categoryPrefs;
  const subcats = childCategories(vocab, current, prefs, editMode);
  const usage = useMemo(() => new Map(Object.entries(st.data.usage)), [st.data.usage]);
  const items = current
    ? itemsInCategory(vocab, current, langs, prefs, { adaptive: settings.adaptiveOrder, usage, includeHidden: editMode })
    : [];
  const tileMin = TILE_MIN[settings.tileSize] ?? 104;
  const colsFor = (width: number) => settings.columns || autoColumns(width || 900, tileMin);
  const uiLang = settings.uiLang;
  const catName = (id: string) => vocab.categories.get(id)?.name[uiLang] ?? id;
  const tap = (item: VocabItem) => st.tapItem(item, { fromTopic: true });

  const open = (id: string) => st.go({ screen: 'topics', path: [...path, id] });
  const children = [
    ...subcats.map((c) => <FolderTile key={`c-${c.id}`} category={c} lang={uiLang} onOpen={() => open(c.id)} />),
    ...items.map((item) => (
      <Tile
        key={item.id}
        item={item}
        lang={lang}
        hidden={isHidden(vocab, item.id)}
        hasSign={!!st.signPack && signsFor(item.id, st).length > 0}
        onActivate={editMode ? () => setEditId(item.id) : tap}
        onDetails={openDetails}
      />
    )),
  ];
  const isFav = !!current && prefs.favourites.includes(current);

  return (
    <section className="screen" aria-labelledby="topics-title">
      <div className="board-head">
        <nav className="crumbs" aria-label={t('topics')}>
          {path.length > 0 && (
            <button onClick={() => st.go({ screen: 'topics', path: path.slice(0, -1) })} aria-label={t('back')} className="btn btn-small" style={{ textDecoration: 'none' }}>
              <Icon name="back" />
            </button>
          )}
          {path.length > 0 && <button onClick={() => st.go({ screen: 'topics', path: [] })}>{t('allTopics')}</button>}
          {path.slice(0, -1).map((id, i) => (
            <span key={id} className="row" style={{ gap: 4 }}>
              <span className="sep" aria-hidden="true">›</span>
              <button onClick={() => st.go({ screen: 'topics', path: path.slice(0, i + 1) })}>{catName(id)}</button>
            </span>
          ))}
          {path.length > 0 && <span className="sep" aria-hidden="true">›</span>}
          <h1 id="topics-title" className="current" style={{ margin: 0 }}>{current ? catName(current) : t('topics')}</h1>
        </nav>
        <div className="board-actions">
          {current && (
            <button className="btn btn-small" aria-pressed={isFav} onClick={() => {
              const favourites = isFav ? prefs.favourites.filter((x) => x !== current) : [...prefs.favourites, current];
              void st.updateCategoryPrefs({ favourites });
            }}>
              <Icon name="star" filled={isFav} /> {isFav ? t('unfavourite') : t('favourite')}
            </button>
          )}
          {editMode && <button className="btn btn-small" onClick={() => setCatMenu(true)}><Icon name="topics" /> {t('topics')}</button>}
          {editMode && current && (
            <button className="btn btn-small" onClick={() => useStore.setState({ editor: { categoryId: current } })}>
              <Icon name="plus" /> {t('addTile')}
            </button>
          )}
          <EditToggle />
        </div>
      </div>
      {editMode && <EditBanner />}
      {children.length ? (
        <Grid cols={colsFor} label={current ? catName(current) : t('topics')}>{children}</Grid>
      ) : (
        <p className="empty">{t('emptyCategory')}</p>
      )}
      {editId && <EditTileMenu itemId={editId} categoryId={current ?? undefined} onClose={() => setEditId(null)} />}
      {catMenu && <CategoryMenu parent={current} onClose={() => setCatMenu(false)} />}
    </section>
  );
}

/** Reorder, hide and show topics. */
function CategoryMenu({ parent, onClose }: { parent: string | null; onClose: () => void }) {
  const t = useT();
  const st = useStore();
  const prefs = st.data.categoryPrefs;
  const list = childCategories(st.vocab, parent, prefs, true);
  const ids = list.map((c) => c.id);
  const move = (i: number, d: number) => {
    const next = [...ids];
    const [x] = next.splice(i, 1);
    next.splice(i + d, 0, x!);
    const order = [...next, ...prefs.order.filter((id) => !next.includes(id))];
    void st.updateCategoryPrefs({ order }, 'Changed the order of topics');
  };
  const toggleHidden = (id: string) => {
    const wasHidden = prefs.hidden.includes(id);
    const hidden = wasHidden ? prefs.hidden.filter((x) => x !== id) : [...prefs.hidden, id];
    void st.updateCategoryPrefs({ hidden }, `${wasHidden ? 'Showed' : 'Hid'} the topic “${st.vocab.categories.get(id)?.name.en}”`);
  };
  return (
    <Dialog title={t('topics')} onClose={onClose}>
      <ul className="list">
        {list.map((c, i) => (
          <li key={c.id} className="list-item">
            <span className="grow big" style={{ opacity: prefs.hidden.includes(c.id) ? 0.5 : 1 }}>{c.name[st.settings.uiLang]}</span>
            <button className="btn btn-small" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`${t('up')}: ${c.name[st.settings.uiLang]}`}><Icon name="up" /></button>
            <button className="btn btn-small" disabled={i === list.length - 1} onClick={() => move(i, 1)} aria-label={`${t('down')}: ${c.name[st.settings.uiLang]}`}><Icon name="down" /></button>
            <button className="btn btn-small" onClick={() => toggleHidden(c.id)}>
              <Icon name={prefs.hidden.includes(c.id) ? 'eye' : 'eyeOff'} /> {prefs.hidden.includes(c.id) ? t('unhide') : t('hide')}
            </button>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
