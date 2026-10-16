// Editing boards and words. Edit mode is entered on purpose (never by accident), can be locked
// with a PIN, and every change is written to the change history so nothing is changed silently.
import { useEffect, useMemo, useRef, useState } from 'react';
import { create } from 'zustand';
import { useStore, useT, displayText, type EditorRequest } from '../state/store';
import { dataset } from '../data/dataset';
import type { Board, Lang, PartOfSpeech, VocabItem } from '../domain/types';
import { primaryLang, activeLangs } from '../domain/settings';
import { coreBoardId, isHidden, itemsInCategory } from '../domain/vocabulary';
import { search } from '../domain/search';
import { boardSnapshots, newId } from '../services/repo';
import { saveImage, saveImageBlob, loadBitmap, renderCrop, type Crop } from '../services/images';
import { exportBoard, importBoard, validateBoardExport, downloadJson } from '../services/backup';
import { Dialog, TextField, Range } from './common';
import { Icon } from './Icon';
import { SymbolImage, Tile } from './Tile';
import { useOnline } from './hooks';
import { en as enStrings, zh as zhStrings } from '../i18n/strings';

// ---------------- PIN ----------------

const usePin = create<{ resolve: ((ok: boolean) => void) | null }>(() => ({ resolve: null }));

export function askPin(): Promise<boolean> {
  return new Promise((resolve) => usePin.setState({ resolve }));
}

export function PinHost() {
  const t = useT();
  const resolve = usePin((s) => s.resolve);
  const pin = useStore((s) => s.settings.editPin);
  const [value, setValue] = useState('');
  const [wrong, setWrong] = useState(false);
  if (!resolve) return null;
  const finish = (ok: boolean) => {
    usePin.setState({ resolve: null });
    setValue('');
    setWrong(false);
    resolve(ok);
  };
  return (
    <Dialog title={t('enterPin')} size="small" onClose={() => finish(false)}
      footer={<>
        <button className="btn" onClick={() => finish(false)}>{t('cancel')}</button>
        <button className="btn btn-primary" onClick={() => (value === pin ? finish(true) : setWrong(true))}>{t('ok')}</button>
      </>}>
      <form onSubmit={(e) => { e.preventDefault(); if (value === pin) finish(true); else setWrong(true); }}>
        <TextField label={t('enterPin')} value={value} onChange={(v) => { setValue(v.replace(/\D/g, '')); setWrong(false); }} type="password" inputMode="numeric" autoFocus />
        {wrong && <p role="alert" className="banner">{t('wrongPin')}</p>}
      </form>
    </Dialog>
  );
}

/** Ask for the helper PIN if editing is locked. Communicating never needs it. */
export async function requestHelperAccess(): Promise<boolean> {
  const st = useStore.getState();
  if (st.settings.editLock && st.settings.editPin && !st.helperUnlocked) {
    const ok = await askPin();
    if (!ok) return false;
    useStore.setState({ helperUnlocked: true });
  }
  return true;
}

/** Open the word editor (new or existing word), asking for the PIN if editing is locked. */
export async function openWordEditor(req: EditorRequest): Promise<void> {
  if (await requestHelperAccess()) useStore.setState({ editor: req, detailItemId: null });
}

/** Enter edit mode, asking for the PIN if editing is locked. */
export async function requestEdit(board?: Board): Promise<boolean> {
  const st = useStore.getState();
  if (!(await requestHelperAccess())) return false;
  if (board?.locked) {
    const ok = await st.confirm({ text: st.t('boardLocked'), confirmLabel: st.t('unlockBoard') });
    if (!ok) return false;
    await st.saveBoard({ ...board, locked: false }, `Unlocked the board “${board.name.en}”`);
  }
  useStore.setState({ editMode: true });
  return true;
}

const label = (item: VocabItem | undefined, lang: Lang, traditional = false) =>
  item ? displayText(item, item.forms[lang] ? lang : lang === 'en' ? 'zh' : 'en', traditional) : '';

// ---------------- Tile menu in edit mode ----------------

export function EditTileMenu({ itemId, board, cellIndex, categoryId, onClose }: {
  itemId: string;
  board?: Board;
  cellIndex?: number;
  categoryId?: string;
  onClose: () => void;
}) {
  const t = useT();
  const st = useStore();
  const item = st.vocab.items.get(itemId);
  if (!item) return null;
  const lang = primaryLang(st.settings);
  const name = label(item, lang, st.settings.traditional);
  const hidden = isHidden(st.vocab, item.id);
  const ov = st.vocab.overrides.get(item.id);
  const run = (fn: () => void) => () => {
    fn();
    onClose();
  };

  const moveInCategory = (delta: number) => {
    if (!categoryId) return;
    const list = itemsInCategory(st.vocab, categoryId, activeLangs(st.settings), st.data.categoryPrefs, { includeHidden: true }).map((i) => i.id);
    const i = list.indexOf(item.id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j]!, list[i]!];
    void st.updateCategoryPrefs({ itemOrder: { ...st.data.categoryPrefs.itemOrder, [categoryId]: list } }, `Moved “${name}” in a topic`);
  };

  return (
    <Dialog title={name} size="small" onClose={onClose}>
      <div className="stack">
        <button className="btn btn-block" onClick={run(() => useStore.setState({ editor: { itemId: item.id } }))}>
          <Icon name="edit" /> {t('editWord')}
        </button>
        {board && cellIndex !== undefined && (
          <button className="btn btn-block" onClick={run(() => useStore.setState({ moveFrom: cellIndex }))}>
            <Icon name="move" /> {t('move')}
          </button>
        )}
        {categoryId && (
          <div className="row">
            <button className="btn" style={{ flex: 1 }} onClick={() => moveInCategory(-1)}><Icon name="left" /> {t('moveLeft')}</button>
            <button className="btn" style={{ flex: 1 }} onClick={() => moveInCategory(1)}>{t('moveRight')} <Icon name="right" /></button>
          </div>
        )}
        {item.essential ? (
          <p className="banner info">{t('essentialNote')}</p>
        ) : (
          <button className="btn btn-block" onClick={run(() => void st.setOverride(item.id, { hidden: !hidden }, `${hidden ? 'Showed' : 'Hid'} “${name}”`))}>
            <Icon name={hidden ? 'eye' : 'eyeOff'} /> {hidden ? t('unhide') : t('hide')}
          </button>
        )}
        {board && cellIndex !== undefined && !(item.essential && board.kind === 'core') && (
          <button className="btn btn-block" onClick={run(() => {
            const cells = [...board.cells];
            cells[cellIndex] = null;
            void st.saveBoard({ ...board, cells }, `Removed “${name}” from “${board.name.en}”`);
          })}>
            <Icon name="clear" /> {t('removeFromBoard')}
          </button>
        )}
        {categoryId && st.settings.adaptiveOrder && (
          <button className="btn btn-block" onClick={run(() => void st.setOverride(item.id, { locked: !ov?.locked }, `${ov?.locked ? 'Unlocked' : 'Locked'} the place of “${name}”`))}>
            <Icon name={ov?.locked ? 'unlock' : 'lock'} /> {ov?.locked ? t('unlockPosition') : t('lockPosition')}
          </button>
        )}
        <button className="btn btn-block" onClick={run(() => useStore.setState({ detailItemId: item.id }))}>
          <Icon name="info" /> {t('more')}
        </button>
      </div>
    </Dialog>
  );
}

// ---------------- Board menu ----------------

export function BoardMenu({ board, onClose }: { board: Board; onClose: () => void }) {
  const t = useT();
  const st = useStore();
  const [versions, setVersions] = useState<{ at: number; board: Board }[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const builtIn = dataset.boards.find((b) => b.id === board.id);
  const isUserCopy = st.userBoards.some((b) => b.id === board.id);
  const isCustom = board.kind === 'custom';
  const [name, setName] = useState(board.name.en);

  const duplicate = async () => {
    const copy: Board = { ...board, id: newId('board-'), kind: 'custom', lang: board.lang, name: { en: `${board.name.en} (copy)`, zh: `${board.name.zh}（副本）` } };
    await st.saveBoard(copy, `Copied the board “${board.name.en}”`);
    st.go({ screen: 'board', boardId: copy.id });
    onClose();
  };

  return (
    <Dialog title={board.name[st.settings.uiLang] ?? board.name.en} onClose={onClose}>
      <div className="stack">
        {isCustom && (
          <div className="row">
            <div style={{ flex: 1 }}><TextField label={t('boardName')} value={name} onChange={setName} /></div>
            <button className="btn" onClick={() => void st.saveBoard({ ...board, name: { en: name, zh: name } }, `Renamed a board to “${name}”`)}>{t('save')}</button>
          </div>
        )}
        <button className="btn btn-block" onClick={async () => setVersions(await boardSnapshots(st.profileId, board.id))}>
          <Icon name="history" /> {t('restoreBoard')}
        </button>
        {versions && (
          versions.length ? (
            <ul className="list">
              {versions.map((v) => (
                <li key={v.at} className="list-item">
                  <span className="grow">{t('versionFrom', { date: new Date(v.at).toLocaleString() })}</span>
                  <button className="btn btn-small" onClick={async () => {
                    await st.saveBoard({ ...v.board, id: board.id }, `Restored an earlier version of “${board.name.en}”`);
                    onClose();
                  }}>{t('restore')}</button>
                </li>
              ))}
            </ul>
          ) : <p className="muted">{t('noVersions')}</p>
        )}
        {builtIn && isUserCopy && (
          <button className="btn btn-block" onClick={async () => {
            if (await st.confirm({ text: t('resetBoardConfirm'), confirmLabel: t('resetBoard') })) {
              await st.saveBoard({ ...builtIn }, `Reset “${board.name.en}” to the original`);
              onClose();
            }
          }}>
            <Icon name="undo" /> {t('resetBoard')}
          </button>
        )}
        <button className="btn btn-block" onClick={() => void duplicate()}><Icon name="copy" /> {t('duplicateBoard')}</button>
        <button className="btn btn-block" onClick={async () => {
          downloadJson(await exportBoard(st.profileId, board, st.customItems), `sayable-board-${board.name.en.replace(/\W+/g, '-').toLowerCase()}.json`);
        }}>
          <Icon name="download" /> {t('exportBoard')}
        </button>
        <button className="btn btn-block" onClick={() => fileRef.current?.click()}><Icon name="upload" /> {t('importBoard')}</button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          try {
            const parsed = validateBoardExport(JSON.parse(await file.text()));
            if (!parsed.ok || !parsed.value) {
              st.toast({ text: parsed.errors.join(' '), tone: 'error', ms: 6000 });
              return;
            }
            const imported = await importBoard(st.profileId, parsed.value);
            await st.reloadProfile();
            useStore.getState().go({ screen: 'board', boardId: imported.id });
            useStore.getState().toast({ text: t('boardImported'), tone: 'success' });
            onClose();
          } catch {
            st.toast({ text: t('importFailed'), tone: 'error' });
          }
        }} />
        <button className="btn btn-block" onClick={async () => {
          await st.saveBoard({ ...board, locked: !board.locked }, `${board.locked ? 'Unlocked' : 'Locked'} the board “${board.name.en}”`);
          if (!board.locked) useStore.setState({ editMode: false });
          onClose();
        }}>
          <Icon name={board.locked ? 'unlock' : 'lock'} /> {board.locked ? t('unlockBoard') : t('lockBoard')}
        </button>
        {isCustom && (
          <button className="btn btn-block btn-danger" onClick={async () => {
            if (await st.confirm({ text: t('deleteBoardConfirm', { name: board.name.en }), confirmLabel: t('deleteBoard'), danger: true })) {
              await st.deleteBoard(board.id);
              st.go({ screen: 'board', boardId: null });
              onClose();
            }
          }}>
            <Icon name="trash" /> {t('deleteBoard')}
          </button>
        )}
      </div>
    </Dialog>
  );
}

// ---------------- Word picker ----------------

export function WordPicker({ onPick, onClose }: { onPick: (item: VocabItem) => void; onClose: () => void }) {
  const t = useT();
  const st = useStore();
  const [q, setQ] = useState('');
  const lang = primaryLang(st.settings);
  const results = useMemo(
    () => (q.trim() ? search(st.getSearchIndex(), q, { langs: activeLangs(st.settings), limit: 40 }).map((r) => r.item) : []),
    [q, st],
  );
  return (
    <Dialog title={t('pickWord')} size="wide" onClose={onClose}
      footer={<>
        <button className="btn" onClick={() => useStore.setState({ editor: { initialText: q, onSaved: (item) => onPick(item) } })}>
          <Icon name="plus" /> {q ? t('addAsNew', { q }) : t('newWord')}
        </button>
        <button className="btn" onClick={onClose}>{t('cancel')}</button>
      </>}>
      <TextField label={t('searchLabel')} value={q} onChange={setQ} placeholder={t('searchPlaceholder')} autoFocus />
      <div className="grid" style={{ '--cols': 5, gridAutoRows: '120px' } as React.CSSProperties}>
        {results.map((item) => <Tile key={item.id} item={item} lang={lang} onActivate={onPick} />)}
      </div>
    </Dialog>
  );
}

// ---------------- Word editor ----------------

const POS_CHOICES: PartOfSpeech[] = ['noun', 'verb', 'adj', 'adv', 'pron', 'phrase', 'interj', 'q', 'prep', 'conj', 'num'];

export function TileEditor() {
  const req = useStore((s) => s.editor);
  if (!req) return null;
  return <TileEditorInner key={req.itemId ?? 'new'} />;
}

function TileEditorInner() {
  const t = useT();
  const st = useStore();
  const req = st.editor!;
  const existing = req.itemId ? st.vocab.items.get(req.itemId) : undefined;
  const builtIn = req.itemId ? dataset.items.find((i) => i.id === req.itemId) : undefined;
  const isCustom = !!existing?.custom || !existing;
  const ov = existing ? st.vocab.overrides.get(existing.id) : undefined;
  const lang = primaryLang(st.settings);

  const [enText, setEn] = useState(existing?.forms.en?.text ?? (lang === 'en' ? req.initialText ?? '' : ''));
  const [zhText, setZh] = useState(existing?.forms.zh?.hans ?? (lang === 'zh' ? req.initialText ?? '' : ''));
  const [pinyin, setPinyin] = useState(existing?.forms.zh?.pinyin ?? '');
  const [sayEn, setSayEn] = useState(existing?.forms.en?.say ?? '');
  const [sayZh, setSayZh] = useState(existing?.forms.zh?.say ?? '');
  const [category, setCategory] = useState(existing?.category ?? req.categoryId ?? 'people');
  const [pos, setPos] = useState<PartOfSpeech>(existing?.pos ?? req.pos ?? 'noun');
  const [keywords, setKeywords] = useState((ov?.keywords ?? (isCustom ? existing?.keywords : []) ?? []).join(', '));
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [imageId, setImageId] = useState<string | null | undefined>(
    existing?.symbol?.set === 'custom' ? String(existing.symbol.id) : undefined,
  );
  const [symbolChoice, setSymbolChoice] = useState<'keep' | 'none' | 'original'>(ov?.symbol === null ? 'none' : 'keep');
  const [onCore, setOnCore] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [symbolSearch, setSymbolSearch] = useState(false);
  const photoRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const close = () => useStore.setState({ editor: null });

  const preview: VocabItem = {
    ...(existing ?? { id: 'preview', kind: 'word', pos, category, categories: [category], frequency: 0.4 }),
    forms: { en: enText ? { text: enText } : undefined, zh: zhText ? { hans: zhText, hant: zhText, pinyin, pinyinNum: '', pinyinPlain: '' } : undefined },
    symbol: imageId ? { set: 'custom', id: imageId } : symbolChoice === 'none' ? undefined : symbolChoice === 'original' ? builtIn?.symbol : existing?.symbol,
  } as VocabItem;

  const fillPinyin = async () => {
    if (!zhText) return;
    const { pinyin: py } = await import('pinyin-pro');
    setPinyin(py(zhText, { type: 'array', nonZh: 'removed' }).join(' '));
  };

  const save = async () => {
    if (!enText.trim() && !zhText.trim()) {
      st.toast({ text: t('needText'), tone: 'warn' });
      return;
    }
    const kw = keywords.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
    const summaryName = enText || zhText;
    if (!existing || existing.custom) {
      // Similar words are allowed, but check first so duplicates are on purpose.
      if (!existing) {
        const dupe = [...st.vocab.items.values()].find(
          (i) => (enText && i.forms.en?.text.toLowerCase() === enText.trim().toLowerCase()) || (zhText && i.forms.zh?.hans === zhText.trim()),
        );
        if (dupe) {
          const ok = await st.confirm({ text: t('similarExists', { word: label(dupe, lang) }), confirmLabel: t('saveAnyway') });
          if (!ok) return;
        }
      }
      let zhForm: VocabItem['forms']['zh'];
      if (zhText.trim()) {
        const [{ pinyin: py }, OpenCC] = await Promise.all([import('pinyin-pro'), import('opencc-js')]);
        const hans = zhText.trim();
        const toHant = OpenCC.Converter({ from: 'cn', to: 'tw' });
        const syl = (pinyin.trim() ? pinyin.trim().split(/\s+/) : py(hans, { type: 'array', nonZh: 'removed' }));
        const nums = py(hans, { type: 'array', toneType: 'num', nonZh: 'removed' }).map((s) => s.replace(/0$/, '5'));
        zhForm = {
          hans,
          hant: toHant(hans),
          pinyin: syl.join(pos === 'phrase' ? ' ' : ''),
          pinyinNum: nums.join(' '),
          pinyinPlain: nums.map((n) => n.replace(/\d/g, '')).join(''),
          say: sayZh || undefined,
        };
      }
      const item: VocabItem = {
        id: existing?.id ?? newId('my-'),
        kind: pos === 'phrase' ? 'phrase' : 'word',
        pos,
        category,
        categories: [category],
        forms: {
          en: enText.trim() ? { text: enText.trim(), say: sayEn || undefined } : undefined,
          zh: zhForm,
        },
        symbol: imageId ? { set: 'custom', id: imageId } : undefined,
        keywords: kw,
        frequency: 0.5,
        custom: true,
        notes: notes || undefined,
      };
      await st.saveCustomItem(item, existing ? `Changed the word “${summaryName}”` : `Added the word “${summaryName}”`);
      if (onCore) await addToCore(item);
      req.onSaved?.(item);
    } else {
      // Built-in word: store only what changed; the original stays available.
      const patch = {
        label: {
          en: enText.trim() && enText.trim() !== builtIn?.forms.en?.text ? enText.trim() : undefined,
          zh: zhText.trim() && zhText.trim() !== builtIn?.forms.zh?.hans ? zhText.trim() : undefined,
        },
        say: { en: sayEn || undefined, zh: sayZh || undefined },
        imageId: imageId ?? undefined,
        symbol: symbolChoice === 'none' ? null : undefined,
        keywords: kw,
        notes: notes || undefined,
      };
      await st.setOverride(existing.id, patch, `Changed the word “${summaryName}”`);
      if (onCore) await addToCore(existing);
      req.onSaved?.(existing);
    }
    st.toast({ text: t('wordSavedMsg', { word: summaryName }), tone: 'success' });
    close();
  };

  const addToCore = async (item: VocabItem) => {
    const s = useStore.getState();
    const id = coreBoardId(primaryLang(s.settings), s.settings.coreLevel);
    const board = s.userBoards.find((b) => b.id === id) ?? dataset.boards.find((b) => b.id === id);
    if (!board || board.cells.includes(item.id)) return;
    const cells = [...board.cells];
    const empty = cells.indexOf(null);
    if (empty >= 0) cells[empty] = item.id;
    else cells.push(item.id, ...Array(board.cols - 1).fill(null));
    await s.saveBoard({ ...board, cells }, `Put “${label(item, 'en')}” on the core board`);
  };

  const categories = [...st.vocab.categories.values()];
  const catName = (id: string) => {
    const c = st.vocab.categories.get(id);
    if (!c) return id;
    const parent = c.parent ? st.vocab.categories.get(c.parent)?.name[st.settings.uiLang] + ' › ' : '';
    return parent + c.name[st.settings.uiLang];
  };

  return (
    <Dialog title={existing ? t('editWord') : t('newWord')} size="wide" onClose={close}
      footer={<>
        {existing?.custom && (
          <button className="btn btn-danger" onClick={async () => {
            if (await st.confirm({ text: t('deleteWordConfirm', { word: label(existing, lang) }), danger: true, confirmLabel: t('delete') })) {
              await st.deleteCustomItem(existing.id);
              close();
            }
          }}><Icon name="trash" /> {t('delete')}</button>
        )}
        <button className="btn" onClick={close}>{t('cancel')}</button>
        <button className="btn btn-primary" onClick={() => void save()}><Icon name="check" /> {t('save')}</button>
      </>}>
      <div className="row" style={{ alignItems: 'flex-start', gap: 24 }}>
        <div style={{ width: 180 }}>
          <div className="tile" style={{ height: 180, pointerEvents: 'none' }} aria-hidden="true">
            <span className="sym"><SymbolImage item={preview} /></span>
            <span className="label">{enText || zhText || '…'}</span>
          </div>
          <div className="stack" style={{ marginTop: 12, gap: 8 }}>
            <button className="btn btn-small btn-block" onClick={() => photoRef.current?.click()}><Icon name="camera" /> {t('takePhoto')}</button>
            <button className="btn btn-small btn-block" onClick={() => fileRef.current?.click()}><Icon name="image" /> {t('choosePicture')}</button>
            <button className="btn btn-small btn-block" onClick={() => setSymbolSearch(true)}><Icon name="search" /> {t('findSymbol')}</button>
            {(imageId || preview.symbol) && (
              <button className="btn btn-small btn-block" onClick={() => { setImageId(null); setSymbolChoice('none'); }}>{t('removePicture')}</button>
            )}
            {builtIn?.symbol && (imageId || symbolChoice === 'none') && (
              <button className="btn btn-small btn-block" onClick={() => { setImageId(undefined); setSymbolChoice('original'); }}>{t('originalSymbol')}</button>
            )}
            <input ref={photoRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { setCropFile(e.target.files?.[0] ?? null); e.target.value = ''; }} />
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { setCropFile(e.target.files?.[0] ?? null); e.target.value = ''; }} />
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 260 }}>
          <TextField label={t('englishText')} value={enText} onChange={setEn} lang="en" autoFocus />
          <TextField label={t('chineseText')} value={zhText} onChange={setZh} lang="zh-Hans" />
          {zhText && (
            <div className="row" style={{ alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}><TextField label={t('pinyinField')} value={pinyin} onChange={setPinyin} lang="zh-Latn-pinyin" /></div>
              <button className="btn" style={{ marginBottom: 12 }} onClick={() => void fillPinyin()}>{t('makePinyin')}</button>
            </div>
          )}
          <TextField label={t('spokenAs') + ' (English)'} help={t('spokenAsHelp')} value={sayEn} onChange={setSayEn} />
          {zhText && <TextField label={t('spokenAs') + ' (中文)'} value={sayZh} onChange={setSayZh} lang="zh-Hans" />}
          {isCustom && (
            <>
              <div className="field">
                <label htmlFor="ed-cat">{t('category')}</label>
                <select id="ed-cat" className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
                  {categories.map((c) => <option key={c.id} value={c.id}>{catName(c.id)}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="ed-pos">{t('wordType')}</label>
                <select id="ed-pos" className="input" value={pos} onChange={(e) => setPos(e.target.value as PartOfSpeech)}>
                  {POS_CHOICES.map((p) => <option key={p} value={p}>{(useStore.getState().settings.uiLang === 'zh' ? zhTypes : enTypes)[p]}</option>)}
                </select>
              </div>
            </>
          )}
          <TextField label={t('keywords')} help={t('keywordsHelp')} value={keywords} onChange={setKeywords} />
          <TextField label={t('notes')} value={notes} onChange={setNotes} multiline />
          <label className="toggle" style={{ cursor: 'pointer' }}>
            <input type="checkbox" checked={onCore} onChange={(e) => setOnCore(e.target.checked)} style={{ width: 24, height: 24 }} />
            <span className="text">{t('putOnCore')}</span>
          </label>
        </div>
      </div>
      {cropFile && (
        <CropDialog file={cropFile} onCancel={() => setCropFile(null)} onDone={(id) => { setImageId(id); setCropFile(null); }} />
      )}
      {symbolSearch && (
        <SymbolSearch initial={enText || zhText} onCancel={() => setSymbolSearch(false)} onDone={(id) => { setImageId(id); setSymbolSearch(false); }} />
      )}
    </Dialog>
  );
}

const enTypes = enStrings.wordTypes as Record<string, string>;
const zhTypes = zhStrings.wordTypes as Record<string, string>;

// ---------------- Cropping ----------------

function CropDialog({ file, onDone, onCancel }: { file: File; onDone: (imageId: string) => void; onCancel: () => void }) {
  const t = useT();
  const profileId = useStore((s) => s.profileId);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [bitmap, setBitmap] = useState<ImageBitmap | HTMLImageElement | null>(null);
  const [crop, setCrop] = useState<Crop>({ x: 0.5, y: 0.5, size: 1 });
  const [busy, setBusy] = useState(false);
  const drag = useRef<{ x: number; y: number; crop: Crop } | null>(null);

  useEffect(() => {
    loadBitmap(file).then(setBitmap).catch(() => onCancel());
  }, [file, onCancel]);

  useEffect(() => {
    if (!bitmap || !canvasRef.current) return;
    renderCrop(bitmap, crop, 360, 'image/png').then(async (blob) => {
      const bmp = await createImageBitmap(blob);
      const c = canvasRef.current;
      if (!c) return;
      c.width = bmp.width;
      c.height = bmp.height;
      c.getContext('2d')!.drawImage(bmp, 0, 0);
    });
  }, [bitmap, crop]);

  const nudge = (dx: number, dy: number) => setCrop((c) => ({ ...c, x: clamp01(c.x + dx), y: clamp01(c.y + dy) }));

  return (
    <Dialog title={t('cropTitle')} onClose={onCancel}
      footer={<>
        <button className="btn" onClick={onCancel}>{t('cancel')}</button>
        <button className="btn btn-primary" disabled={busy || !bitmap} onClick={async () => {
          setBusy(true);
          try {
            onDone(await saveImage(profileId, file, crop));
          } catch {
            useStore.getState().toast({ text: t('storageLow'), tone: 'error' });
            setBusy(false);
          }
        }}><Icon name="check" /> {t('done')}</button>
      </>}>
      <div className="crop-box"
        onPointerDown={(e) => { drag.current = { x: e.clientX, y: e.clientY, crop }; (e.target as HTMLElement).setPointerCapture?.(e.pointerId); }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
          const f = (1 - drag.current.crop.size) || 0.0001;
          setCrop({ ...drag.current.crop, x: clamp01(drag.current.crop.x - (e.clientX - drag.current.x) / box.width / f * drag.current.crop.size), y: clamp01(drag.current.crop.y - (e.clientY - drag.current.y) / box.height / f * drag.current.crop.size) });
        }}
        onPointerUp={() => (drag.current = null)}>
        <canvas ref={canvasRef} aria-label={t('picture')} />
      </div>
      <Range label={t('zoom')} value={Math.round((1 - crop.size) * 100) / 100} min={0} max={0.8} step={0.05}
        onChange={(v) => setCrop((c) => ({ ...c, size: 1 - v }))} display={(v) => `${Math.round(100 / (1 - v))}%`} />
      <div className="row" style={{ justifyContent: 'center' }}>
        <button className="btn" onClick={() => nudge(-0.1, 0)} aria-label={t('left')}><Icon name="left" /></button>
        <button className="btn" onClick={() => nudge(0, -0.1)} aria-label={t('up')}><Icon name="up" /></button>
        <button className="btn" onClick={() => nudge(0, 0.1)} aria-label={t('down')}><Icon name="down" /></button>
        <button className="btn" onClick={() => nudge(0.1, 0)} aria-label={t('right')}><Icon name="right" /></button>
      </div>
    </Dialog>
  );
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

// ---------------- ARASAAC symbol search (online, optional) ----------------

function SymbolSearch({ initial, onDone, onCancel }: { initial: string; onDone: (imageId: string) => void; onCancel: () => void }) {
  const t = useT();
  const profileId = useStore((s) => s.profileId);
  const online = useOnline();
  const [q, setQ] = useState(initial);
  const [results, setResults] = useState<number[]>([]);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (!q.trim()) return;
    setBusy(true);
    setError(false);
    try {
      const locale = /[㐀-鿿]/.test(q) ? 'zh' : 'en';
      const res = await fetch(`https://api.arasaac.org/v1/pictograms/${locale}/search/${encodeURIComponent(q.trim())}`);
      const json = res.ok ? ((await res.json()) as { _id: number; sex?: boolean; violence?: boolean }[]) : [];
      setResults(json.filter((r) => !r.sex && !r.violence).slice(0, 40).map((r) => r._id));
    } catch {
      setError(true);
    }
    setBusy(false);
  };

  useEffect(() => {
    if (online) void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Dialog title={t('symbolSearchTitle')} size="wide" onClose={onCancel}>
      <p className="muted">{t('symbolSearchHelp')}</p>
      <form className="row" onSubmit={(e) => { e.preventDefault(); void run(); }}>
        <div style={{ flex: 1 }}><TextField label={t('searchLabel')} value={q} onChange={setQ} /></div>
        <button className="btn btn-primary" type="submit" disabled={busy || !online}><Icon name="search" /> {t('navSearch')}</button>
      </form>
      {(!online || error) && <p className="banner">{t('symbolSearchFail')}</p>}
      <div className="symbol-results">
        {results.map((id) => (
          <button key={id} onClick={async () => {
            try {
              const blob = await fetch(`https://static.arasaac.org/pictograms/${id}/${id}_300.png`).then((r) => r.blob());
              onDone(await saveImageBlob(profileId, blob));
            } catch {
              setError(true);
            }
          }} aria-label={`ARASAAC ${id}`}>
            <img src={`https://static.arasaac.org/pictograms/${id}/${id}_300.png`} alt="" loading="lazy" />
          </button>
        ))}
      </div>
    </Dialog>
  );
}
