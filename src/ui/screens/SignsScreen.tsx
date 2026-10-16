// Explore vocabulary through sign language: search, recent signs, favourites and topics.
import { useEffect, useMemo, useState } from 'react';
import { useStore, useT, signsFor, displayText } from '../../state/store';
import { primaryLang, activeLangs } from '../../domain/settings';
import { search } from '../../domain/search';
import type { VocabItem } from '../../domain/types';
import { Tile, Grid, autoColumns } from '../Tile';
import { Dialog, TextField } from '../common';
import { SignViewer } from '../Detail';
import { TILE_MIN } from './BoardScreen';

const NAMES = { nzsl: 'NZSL', asl: 'ASL', bsl: 'BSL', none: '' } as const;

export function SignsScreen() {
  const t = useT();
  const st = useStore();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string>('');
  const [open, setOpen] = useState<VocabItem | null>(null);
  const lang = primaryLang(st.settings);
  useEffect(() => void st.loadSigns(), [st]);

  const withSigns = useMemo(() => {
    if (!st.signPack && st.settings.signLanguage === 'nzsl') return [];
    return [...st.vocab.items.values()].filter((i) => i.forms[lang] && signsFor(i.id, st).length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.signPack, st.vocabVersion, st.customSigns, st.settings.signLanguage, lang]);

  const shown = useMemo(() => {
    let list = withSigns;
    if (q.trim()) {
      const ids = new Set(search(st.getSearchIndex(), q, { langs: activeLangs(st.settings), limit: 200 }).map((r) => r.item.id));
      list = list.filter((i) => ids.has(i.id));
    }
    if (cat === '__fav') list = list.filter((i) => st.vocab.overrides.get(i.id)?.favourite);
    else if (cat) list = list.filter((i) => i.categories.includes(cat) || st.vocab.categories.get(i.category)?.parent === cat);
    return list.slice(0, 240);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [withSigns, q, cat]);

  const recent = st.data.recentSigns.map((id) => st.vocab.items.get(id)).filter((i): i is VocabItem => !!i && !!i.forms[lang]).slice(0, 8);
  const tileMin = TILE_MIN[st.settings.tileSize] ?? 104;
  const topCats = [...st.vocab.categories.values()].filter((c) => !c.parent);
  const signLang = st.settings.signLanguage;

  return (
    <section className="screen" aria-labelledby="signs-title">
      <div className="screen-head">
        <h1 id="signs-title">{t('signsTitle')} · {NAMES[signLang]}</h1>
        <span className="muted">{t('signsCount', { n: withSigns.length })}</span>
      </div>
      {signLang !== 'nzsl' && <p className="banner">{t('signsNotInstalled', { lang: NAMES[signLang] })} {t('noSignLang', { lang: NAMES[signLang] })}</p>}
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <div style={{ flex: 2, minWidth: 220 }}><TextField label={t('signSearch')} value={q} onChange={setQ} placeholder={t('searchPlaceholder')} /></div>
        <div className="field" style={{ flex: 1, minWidth: 180 }}>
          <label htmlFor="sign-cat">{t('category')}</label>
          <select id="sign-cat" className="input" value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="">{t('allTopics')}</option>
            <option value="__fav">★ {t('favTitle')}</option>
            {topCats.map((c) => <option key={c.id} value={c.id}>{c.name[st.settings.uiLang]}</option>)}
          </select>
        </div>
      </div>
      {recent.length > 0 && !q && !cat && (
        <>
          <h2 style={{ fontSize: 'var(--fs-m)', margin: '4px 0' }}>{t('recentSigns')}</h2>
          <div className="recent-row">
            {recent.map((item) => <Tile key={item.id} item={item} lang={lang} hasSign onActivate={setOpen} />)}
          </div>
        </>
      )}
      <p className="muted small">{t('signsIntro')}</p>
      <Grid cols={(w) => autoColumns(w || 900, tileMin)} label={t('signsTitle')}>
        {shown.map((item) => <Tile key={item.id} item={item} lang={lang} hasSign onActivate={setOpen} />)}
      </Grid>
      <p className="small muted">{t('signCredit')}</p>
      {open && (
        <Dialog title={displayText(open, open.forms[lang] ? lang : lang === 'en' ? 'zh' : 'en', st.settings.traditional)} size="wide" onClose={() => setOpen(null)}
          footer={<>
            <button className="btn" onClick={() => { st.tapItem(open); }}>{t('detailAdd')}</button>
            <button className="btn btn-primary" onClick={() => setOpen(null)}>{t('close')}</button>
          </>}>
          <SignViewer item={open} large />
        </Dialog>
      )}
    </section>
  );
}
