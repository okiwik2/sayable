// Search, quick phrases, favourites, saved messages, boards, safety and the large "Show" view.
import { useMemo, useState } from 'react';
import { aboutMeLines } from '../../domain/safety';
import { EmergencyScreen, useSafetyLabels } from '../Emergency';
import { PainScale } from '../PainScale';
import { useStore, useT, displayText, signsFor } from '../../state/store';
import { dataset } from '../../data/dataset';
import { primaryLang, activeLangs } from '../../domain/settings';
import { search, searchCategories } from '../../domain/search';
import { formatMessage } from '../../domain/format';
import { typedToken } from '../../domain/sentence';
import { isHidden, coreBoardId } from '../../domain/vocabulary';
import type { Board, VocabItem } from '../../domain/types';
import { Tile, FolderTile, Grid, autoColumns } from '../Tile';
import { QuickButton } from '../Bars';
import { Icon } from '../Icon';
import { TextField } from '../common';
import { TILE_MIN } from './BoardScreen';
import { newId } from '../../services/repo';

const openDetails = (item: VocabItem) => useStore.setState({ detailItemId: item.id });

// ---------------- Search ----------------

export function SearchScreen() {
  const t = useT();
  const st = useStore();
  const [q, setQ] = useState('');
  const lang = primaryLang(st.settings);
  const langs = activeLangs(st.settings);
  const usage = st.data.usage;
  const results = useMemo(() => {
    if (!q.trim()) return [];
    return search(st.getSearchIndex(), q, {
      langs,
      limit: 80,
      include: (item) => !isHidden(st.vocab, item.id),
      boost: (id) => Math.min(6, Math.log2(1 + (usage[id]?.count ?? 0))) + (st.vocab.overrides.get(id)?.favourite ? 3 : 0),
    }).map((r) => r.item);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, st.vocabVersion, langs.join(), usage]);
  const cats = useMemo(() => (q.trim() ? searchCategories(st.vocab.categories.values(), q).slice(0, 6) : []), [q, st.vocab]);
  const tileMin = TILE_MIN[st.settings.tileSize] ?? 104;
  const typedLang = /[㐀-鿿]/.test(q) ? 'zh' : 'en';

  return (
    <section className="screen" aria-labelledby="search-title">
      <div className="screen-head">
        <h1 id="search-title">{t('navSearch')}</h1>
      </div>
      <form onSubmit={(e) => e.preventDefault()} role="search">
        <TextField label={t('searchLabel')} value={q} onChange={setQ} placeholder={t('searchPlaceholder')} autoFocus inputMode="search" />
      </form>
      {q.trim() && (
        <p className="muted small" aria-live="polite">{t('results', { n: results.length })}</p>
      )}
      {cats.length > 0 && (
        <div className="row" style={{ marginBottom: 8 }}>
          <span className="suggest-label">{t('topicResults')}</span>
          {cats.map((c) => (
            <button key={c.id} className="btn btn-small" onClick={() => st.go({ screen: 'topics', path: c.parent ? [c.parent, c.id] : [c.id] })}>
              <Icon name="folder" /> {c.name[st.settings.uiLang]}
            </button>
          ))}
        </div>
      )}
      {results.length > 0 ? (
        <Grid cols={(w) => autoColumns(w || 900, tileMin)} label={t('navSearch')}>
          {results.map((item) => (
            <Tile key={item.id} item={item} lang={lang} onActivate={(i) => st.tapItem(i)} onDetails={openDetails}
              hasSign={!!st.signPack && signsFor(item.id, st).length > 0} />
          ))}
        </Grid>
      ) : q.trim() ? (
        <div className="empty">
          <p>{t('noResults')}</p>
          <div className="row" style={{ justifyContent: 'center' }}>
            <button className="btn btn-primary" onClick={() => st.addTokens([typedToken(q.trim(), typedLang)])}>
              <Icon name="plus" /> {t('addTypedToMessage', { q: q.trim() })}
            </button>
            <button className="btn" onClick={() => useStore.setState({ editor: { initialText: q.trim() } })}>
              <Icon name="edit" /> {t('addAsNew', { q: q.trim() })}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

// ---------------- Quick phrases ----------------

export function QuickScreen() {
  const t = useT();
  const st = useStore();
  const groups = st.data.quickGroups ?? dataset.quickGroups;
  const uiLang = st.settings.uiLang;
  const pinned = st.settings.pinned;
  const [editing, setEditing] = useState(false);
  const [newText, setNewText] = useState('');

  const togglePin = (id: string) => {
    const next = pinned.includes(id) ? pinned.filter((x) => x !== id) : [...pinned, id];
    st.updateSettings({ pinned: next });
    void st.logChange(`${pinned.includes(id) ? 'Unpinned' : 'Pinned'} a quick reply`);
  };

  const addPhrase = async () => {
    const text = newText.trim();
    if (!text) return;
    const isZh = /[㐀-鿿]/.test(text);
    const item: VocabItem = {
      id: newId('my-q-'),
      kind: 'phrase',
      pos: 'phrase',
      category: 'social',
      categories: ['social'],
      forms: isZh ? { zh: { hans: text, hant: text, pinyin: '', pinyinNum: '', pinyinPlain: '' } } : { en: { text } },
      frequency: 0.6,
      quick: true,
      custom: true,
    };
    await st.saveCustomItem(item, `Added the quick phrase “${text}”`);
    const base = st.data.quickGroups ?? dataset.quickGroups;
    const mine = base.find((g) => g.id === 'mine') ?? { id: 'mine', name: { en: 'My phrases', zh: '我的短语' }, items: [] };
    await st.saveQuickGroups([...base.filter((g) => g.id !== 'mine'), { ...mine, items: [...mine.items, item.id] }]);
    setNewText('');
  };

  return (
    <section className="screen" aria-labelledby="quick-title">
      <div className="screen-head">
        <h1 id="quick-title">{t('quickTitle')}</h1>
        <button className="btn btn-small" aria-pressed={editing} onClick={() => setEditing(!editing)} style={{ marginLeft: 'auto' }}>
          <Icon name="edit" /> {t('editQuick')}
        </button>
      </div>
      <div className="screen-body quick-groups">
        {editing && (
          <div className="section">
            <form className="row" onSubmit={(e) => { e.preventDefault(); void addPhrase(); }}>
              <div style={{ flex: 1 }}><TextField label={t('newQuickPhrase')} value={newText} onChange={setNewText} /></div>
              <button className="btn btn-primary" type="submit"><Icon name="plus" /> {t('add')}</button>
            </form>
            <p className="small muted">{t('pinnedEdit')}: {t('essentialNote')}</p>
          </div>
        )}
        {groups.map((g) => {
          const items = g.items.map((id) => st.vocab.items.get(id)).filter((i): i is VocabItem => !!i);
          if (!items.length) return null;
          return (
            <div key={g.id} data-scan-group>
              <h2 style={{ fontSize: 'var(--fs-l)', margin: '0 0 8px' }}>{g.name[uiLang]}</h2>
              <div className="quick-grid">
                {items.map((item) => (
                  <div key={item.id} className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
                    <QuickButton item={item} />
                    {editing && (
                      <button className="btn btn-small" aria-pressed={pinned.includes(item.id)} onClick={() => togglePin(item.id)} aria-label={`${t('pinnedEdit')}: ${displayText(item, item.forms.en ? 'en' : 'zh', false)}`}>
                        <Icon name="pin" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ---------------- Favourites ----------------

export function FavouritesScreen() {
  const t = useT();
  const st = useStore();
  const lang = primaryLang(st.settings);
  const words = [...st.vocab.items.values()].filter((i) => st.vocab.overrides.get(i.id)?.favourite && !isHidden(st.vocab, i.id));
  const topics = st.data.categoryPrefs.favourites.map((id) => st.vocab.categories.get(id)).filter(Boolean);
  const messages = st.saved.filter((m) => m.favourite);
  const tileMin = TILE_MIN[st.settings.tileSize] ?? 104;
  const empty = !words.length && !topics.length && !messages.length;
  return (
    <section className="screen" aria-labelledby="fav-title">
      <div className="screen-head"><h1 id="fav-title">{t('favTitle')}</h1></div>
      <div className="screen-body">
        {empty && <p className="empty">{t('favEmpty')}</p>}
        {words.length > 0 && (
          <>
            <h2>{t('favWords')}</h2>
            <Grid cols={(w) => autoColumns(w || 900, tileMin)} label={t('favWords')}>
              {words.map((item) => <Tile key={item.id} item={item} lang={lang} onActivate={(i) => st.tapItem(i)} onDetails={openDetails} />)}
            </Grid>
          </>
        )}
        {topics.length > 0 && (
          <>
            <h2>{t('favTopics')}</h2>
            <Grid cols={(w) => autoColumns(w || 900, tileMin)} label={t('favTopics')}>
              {topics.map((c) => (
                <FolderTile key={c!.id} category={c!} lang={st.settings.uiLang}
                  onOpen={() => st.go({ screen: 'topics', path: c!.parent ? [c!.parent, c!.id] : [c!.id] })} />
              ))}
            </Grid>
          </>
        )}
        {messages.length > 0 && (
          <>
            <h2>{t('favMessages')}</h2>
            <SavedList list={messages} />
          </>
        )}
      </div>
    </section>
  );
}

// ---------------- Saved and history ----------------

function SavedList({ list, history }: { list: { id: string; text: string; tokens: import('../../domain/types').Token[]; favourite?: boolean }[]; history?: boolean }) {
  const t = useT();
  const st = useStore();
  return (
    <ul className="list">
      {list.map((m) => (
        <li key={m.id} className="list-item" data-scan-group>
          <span className="grow big">{m.text}</span>
          <button className="btn btn-primary" onClick={() => void st.speakTokens(m.tokens, { record: true })} data-scan-item>
            <Icon name="speak" /> {t('speak')}
          </button>
          <button className="btn" onClick={() => st.useSaved(m)} data-scan-item>{t('putInMessage')}</button>
          {!history && (
            <>
              <button className="btn btn-small" aria-pressed={!!m.favourite} onClick={() => void st.toggleSavedFavourite(m.id)} aria-label={t('favourite')} data-scan-item>
                <Icon name="star" filled={!!m.favourite} />
              </button>
              <button className="btn btn-small btn-danger" onClick={async () => {
                if (await st.confirm({ text: t('deleteWordConfirm', { word: m.text }), danger: true, confirmLabel: t('delete') })) await st.deleteSaved(m.id);
              }} aria-label={t('delete')} data-scan-item>
                <Icon name="trash" />
              </button>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

export function SavedScreen() {
  const t = useT();
  const st = useStore();
  const [tab, setTab] = useState<'saved' | 'history'>('saved');
  return (
    <section className="screen" aria-labelledby="saved-title">
      <div className="screen-head">
        <h1 id="saved-title">{tab === 'saved' ? t('savedTitle') : t('historyTitle')}</h1>
        <div className="row" role="tablist" style={{ marginLeft: 'auto' }}>
          <button className="btn btn-small" role="tab" aria-selected={tab === 'saved'} aria-pressed={tab === 'saved'} onClick={() => setTab('saved')}>
            <Icon name="bookmark" /> {t('savedTitle')}
          </button>
          <button className="btn btn-small" role="tab" aria-selected={tab === 'history'} aria-pressed={tab === 'history'} onClick={() => setTab('history')}>
            <Icon name="history" /> {t('historyTitle')}
          </button>
        </div>
      </div>
      <div className="screen-body">
        {tab === 'saved' && (
          <>
            <button className="btn" style={{ marginBottom: 12 }} disabled={!st.message.tokens.length} onClick={() => void st.saveMessage()}>
              <Icon name="save" /> {t('saveCurrent')}
            </button>
            {st.saved.length ? <SavedList list={st.saved} /> : <p className="empty">{t('savedEmpty')}</p>}
          </>
        )}
        {tab === 'history' && (
          <>
            {!st.settings.keepHistory && <p className="banner">{t('historyOff')}</p>}
            {st.history.length > 0 && (
              <button className="btn btn-danger" style={{ marginBottom: 12 }} onClick={async () => {
                if (await st.confirm({ text: t('clearHistoryConfirm'), danger: true, confirmLabel: t('clearHistory') })) await st.clearHistory();
              }}>
                <Icon name="trash" /> {t('clearHistory')}
              </button>
            )}
            {st.history.length ? <SavedList list={st.history} history /> : <p className="empty">{t('historyEmpty')}</p>}
          </>
        )}
      </div>
    </section>
  );
}

// ---------------- Boards ----------------

export function BoardsScreen() {
  const t = useT();
  const st = useStore();
  const lang = primaryLang(st.settings);
  const uiLang = st.settings.uiLang;
  const coreId = coreBoardId(lang, st.settings.coreLevel);
  const all: Board[] = [
    ...dataset.boards.map((b) => st.userBoards.find((u) => u.id === b.id) ?? b),
    ...st.userBoards.filter((u) => !dataset.boards.some((b) => b.id === u.id)),
  ];
  const context = all.filter((b) => b.kind === 'context');
  const mine = all.filter((b) => b.kind === 'custom');
  const current = st.view.screen === 'board' ? st.view.boardId : null;
  const active = current ?? coreId;
  const open = (b: Board | null) => st.go({ screen: 'board', boardId: b && b.id !== coreId ? b.id : null });
  const newBoard = async () => {
    const board: Board = { id: newId('board-'), name: { en: 'My board', zh: '我的词板' }, kind: 'custom', lang: null, level: null, cols: 6, cells: Array(24).fill(null) };
    await st.saveBoard(board, 'Created a new board');
    open(board);
    useStore.setState({ editMode: true });
  };
  const card = (b: Board) => (
    <button key={b.id} className="card" aria-current={active === b.id ? 'true' : undefined} onClick={() => open(b)}
      style={active === b.id ? { borderColor: 'var(--primary)', boxShadow: 'inset 0 0 0 2px var(--primary)' } : undefined}>
      <h3>{b.name[uiLang] ?? b.name.en}</h3>
      <span className="muted small">{t('wordsCount', { n: b.cells.filter(Boolean).length })}</span>
    </button>
  );
  const core = all.find((b) => b.id === coreId);
  return (
    <section className="screen" aria-labelledby="boards-title">
      <div className="screen-head">
        <h1 id="boards-title">{t('boardsTitle')}</h1>
        <button className="btn btn-small" style={{ marginLeft: 'auto' }} onClick={() => void newBoard()}><Icon name="plus" /> {t('newBoard')}</button>
      </div>
      <div className="screen-body">
        <p className="muted">{t('boardsIntro')}</p>
        <div className="cards" style={{ marginBottom: 24 }}>
          {core && (
            <button className="card" onClick={() => open(null)} aria-current={active === coreId ? 'true' : undefined}
              style={active === coreId ? { borderColor: 'var(--primary)', boxShadow: 'inset 0 0 0 2px var(--primary)' } : undefined}>
              <h3><Icon name="core" /> {core.name[uiLang]}</h3>
              <span className="muted small">{t('wordsCount', { n: core.cells.filter(Boolean).length })}</span>
            </button>
          )}
        </div>
        <h2>{t('contextBoards')}</h2>
        <div className="cards" style={{ marginBottom: 24 }}>{context.map(card)}</div>
        {mine.length > 0 && (
          <>
            <h2>{t('myBoards')}</h2>
            <div className="cards">{mine.map(card)}</div>
          </>
        )}
      </div>
    </section>
  );
}

// ---------------- Safety ----------------

export function SafetyScreen() {
  const t = useT();
  const st = useStore();
  const { settings } = st;
  const lang = primaryLang(settings);
  const safetyItems = [...st.vocab.items.values()].filter((i) => i.categories.includes('safety') && !!i.forms[lang]);
  const [showEmergency, setShowEmergency] = useState(false);
  const tileMin = TILE_MIN[settings.tileSize] ?? 104;
  const emergency = settings.emergencyMessage || t('emergencyDefault');
  const details = aboutMeLines(settings, useSafetyLabels());
  const [pain, setPain] = useState(false);

  return (
    <section className="screen" aria-labelledby="safety-title">
      <div className="screen-head">
        <h1 id="safety-title"><Icon name="shield" /> {t('safetyTitle')}</h1>
        <button className="btn btn-small" style={{ marginLeft: 'auto' }} onClick={() => st.go({ screen: 'settings', section: 'safety' })}>
          <Icon name="edit" /> {t('editSafety')}
        </button>
      </div>
      <div className="screen-body">
        <div className="row" style={{ marginBottom: 16 }}>
          <button className="btn btn-danger-solid" style={{ minHeight: 72, fontSize: 'var(--fs-l)' }} onClick={() => setShowEmergency(true)}>
            <Icon name="show" /> {t('showEmergency')}
          </button>
          <button className="btn" style={{ minHeight: 72 }} onClick={() => st.sayWord(emergency, /[㐀-鿿]/.test(emergency) ? 'zh' : 'en')}>
            <Icon name="speak" /> {t('speak')}
          </button>
          {settings.painScale && (
            <button className="btn" style={{ minHeight: 72 }} onClick={() => setPain(true)}>
              <Icon name="person" /> {t('whereHurts')}
            </button>
          )}
        </div>
        {details.length > 0 && (
          <div className="section">
            <h2>{settings.medicalCard ? t('medicalCard') : t('aboutMe')}</h2>
            {details.map((d) => <p key={d}>{d}</p>)}
          </div>
        )}
        {settings.contacts.length > 0 && (
          <div className="section">
            <h2>{t('contacts')}</h2>
            <p className="small muted">{t('callNote')}</p>
            <ul className="list">
              {settings.contacts.map((c) => (
                <li key={c.id} className="list-item">
                  <span className="grow"><strong>{c.name}</strong> {c.relation && <span className="muted">({c.relation})</span>}<br />{c.phone}</span>
                  {c.phone && <a className="btn btn-primary" href={`tel:${c.phone.replace(/[^\d+]/g, '')}`}><Icon name="phone" /> {t('call', { name: c.name })}</a>}
                </li>
              ))}
            </ul>
          </div>
        )}
        <h2>{t('safetyWords')}</h2>
        <Grid cols={(w) => autoColumns(w || 900, tileMin)} label={t('safetyWords')}>
          {safetyItems.map((item) => <Tile key={item.id} item={item} lang={lang} onActivate={(i) => st.tapItem(i)} onDetails={openDetails} />)}
        </Grid>
      </div>
      {showEmergency && <EmergencyScreen onClose={() => setShowEmergency(false)} />}
      {pain && <PainScale onClose={() => setPain(false)} />}
    </section>
  );
}

// ---------------- Show (large text) ----------------

export function ShowHost() {
  const open = useStore((s) => s.showOpen);
  const tokens = useStore((s) => s.message.tokens);
  const settings = useStore((s) => s.settings);
  if (!open) return null;
  return <ShowView text={formatMessage(tokens, settings).text} onClose={() => useStore.setState({ showOpen: false })} />;
}

export function ShowView({ text, onClose, emergency }: { text: string; onClose: () => void; emergency?: boolean }) {
  const t = useT();
  const [flipped, setFlipped] = useState(false);
  const [size, setSize] = useState(4.5);
  return (
    <div className={`show-screen ${flipped ? 'flipped' : ''} ${emergency ? 'emergency' : ''}`} role="dialog" aria-modal="true" aria-label={t('showTitle')}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="show-text" style={{ '--show-size': `${size}rem`, whiteSpace: 'pre-wrap' } as React.CSSProperties} lang={/[㐀-鿿]/.test(text) ? 'zh' : 'en'}>
        {text || t('showEmpty')}
      </div>
      <div className="show-bar">
        <button className="btn" onClick={() => setSize((s) => Math.max(1.5, s - 0.75))}>{t('smaller')}</button>
        <button className="btn" onClick={() => setSize((s) => Math.min(10, s + 0.75))}>{t('bigger')}</button>
        <button className="btn" aria-pressed={flipped} onClick={() => setFlipped(!flipped)}><Icon name="flip" /> {t('flip')}</button>
        <button className="btn btn-primary" onClick={onClose} autoFocus><Icon name="clear" /> {t('close')}</button>
      </div>
    </div>
  );
}
