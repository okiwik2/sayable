// Word details and the sign-language viewer.
import { useEffect, useRef, useState } from 'react';
import { useStore, useT, displayText, signsFor } from '../state/store';
import { primaryLang } from '../domain/settings';
import { formsFor } from '../domain/inflect';
import type { SignResource, VocabItem } from '../domain/types';
import { Dialog, TextField } from './common';
import { Icon } from './Icon';
import { SymbolImage } from './Tile';
import { assetUrl, useOnline, useStoredImage } from './hooks';
import { openWordEditor } from './Editing';
import { newId } from '../services/repo';
import { saveImageBlob } from '../services/images';

export function ItemDetail() {
  const id = useStore((s) => s.detailItemId);
  const item = useStore((s) => (id ? s.vocab.items.get(id) : undefined));
  if (!item) return null;
  return <ItemDetailInner item={item} />;
}

function ItemDetailInner({ item }: { item: VocabItem }) {
  const t = useT();
  const st = useStore();
  const { settings } = st;
  const lang = primaryLang(settings);
  const useLang = item.forms[lang] ? lang : lang === 'en' ? 'zh' : 'en';
  const other = useLang === 'en' ? 'zh' : 'en';
  const main = displayText(item, useLang, settings.traditional);
  const second = item.forms[other] ? displayText(item, other, settings.traditional) : undefined;
  const zh = item.forms.zh;
  const fav = !!st.vocab.overrides.get(item.id)?.favourite;
  const forms = useLang === 'en' ? formsFor(item) : [];
  const close = () => useStore.setState({ detailItemId: null });
  const zhLang = settings.traditional ? 'zh-Hant' : 'zh-Hans';

  return (
    <Dialog title={main} size="wide" onClose={close}>
      <div className="detail-top">
        <div className="detail-sym"><SymbolImage item={item} size="full" alt={main} /></div>
        <div className="detail-words">
          <div className="main" lang={useLang === 'zh' ? zhLang : 'en'}>{main}</div>
          {useLang === 'zh' && zh && <div className="second" lang="zh-Latn-pinyin">{zh.pinyin} <span className="small">({zh.pinyinNum})</span></div>}
          {second && <div className="second" lang={other === 'zh' ? zhLang : 'en'}>{second}{other === 'zh' && zh ? ` · ${zh.pinyin}` : ''}</div>}
          {zh?.gloss && <div className="second">{t('meaning')}: {zh.gloss}</div>}
          {item.notes && <p className="muted">{item.notes}</p>}
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn btn-primary" onClick={() => { st.tapItem(item); close(); }}><Icon name="plus" /> {t('detailAdd')}</button>
            <button className="btn" onClick={() => st.sayWord(useLang === 'en' ? item.forms.en?.say ?? main : zh?.say ?? main, useLang)}><Icon name="speak" /> {t('detailSay')}</button>
            <button className="btn" aria-pressed={fav} onClick={() => st.toggleFavourite(item.id)}>
              <Icon name="star" filled={fav} /> {fav ? t('unfavourite') : t('favourite')}
            </button>
            <button className="btn" onClick={() => void openWordEditor({ itemId: item.id })}>
              <Icon name="edit" /> {t('editTile')}
            </button>
          </div>
          {forms.length > 0 && (
            <div className="field" style={{ marginTop: 12 }}>
              <span className="label">{t('wordForms')}</span>
              <div className="row">
                {forms.map((f) => (
                  <button key={f.form} className="btn btn-small" onClick={() => { st.tapItem(item, { lang: 'en', form: f.form }); close(); }}>{f.text}</button>
                ))}
              </div>
            </div>
          )}
          <div className="field" style={{ marginTop: 8 }}>
            <span className="label">{t('alsoIn')}</span>
            <div className="row">
              {item.categories.map((c) => {
                const cat = st.vocab.categories.get(c);
                if (!cat) return null;
                const path = cat.parent ? [cat.parent, cat.id] : [cat.id];
                return <button key={c} className="btn btn-small" onClick={() => { st.go({ screen: 'topics', path }); }}>{cat.name[settings.uiLang]}</button>;
              })}
            </div>
          </div>
        </div>
      </div>
      {settings.signLanguage !== 'none' && <SignViewer item={item} />}
    </Dialog>
  );
}

const SIGN_LANG_NAMES = { nzsl: 'NZSL', asl: 'ASL', bsl: 'BSL', none: '' } as const;

export function SignViewer({ item, large }: { item: VocabItem; large?: boolean }) {
  const t = useT();
  const st = useStore();
  const online = useOnline();
  const { settings } = st;
  const [index, setIndex] = useState(0);
  const [adding, setAdding] = useState(false);
  useEffect(() => {
    void st.loadSigns();
    st.noteSignViewed(item.id);
    setIndex(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  const signs = signsFor(item.id, st);
  const word = displayText(item, item.forms.en ? 'en' : 'zh', settings.traditional);
  const current = signs[index];

  if (!st.signPack && settings.signLanguage === 'nzsl') return <p className="muted">{t('loading')}</p>;

  return (
    <section className="sign-panel" aria-label={t('signFor', { word })}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0 }}><Icon name="hand" /> {t('signFor', { word })} · {SIGN_LANG_NAMES[settings.signLanguage]}</h3>
        <button className="btn btn-small" onClick={() => setAdding(true)}><Icon name="plus" /> {t('addOwnSign')}</button>
      </div>
      {!signs.length && (
        <p className="muted">{settings.signLanguage === 'nzsl' ? t('noSign') : t('noSignLang', { lang: SIGN_LANG_NAMES[settings.signLanguage] })}</p>
      )}
      {current && (
        <>
          <SignMedia sign={current} online={online} large={large} />
          <div className="row" style={{ marginTop: 8 }}>
            <strong>{current.gloss}</strong>
            {current.maori && <span className="muted">{t('maori')}: {current.maori}</span>}
            {current.verification === 'dictionary-match' && <span className="sign-status">{t('signMatched', { word: item.forms.en?.text ?? word })}</span>}
            {current.verification === 'reviewed' && <span className="sign-status is-reviewed"><Icon name="check" size={16} /> {t('signReviewed')}</span>}
            {current.verification === 'custom' && <span className="sign-status">{t('customSign')}</span>}
          </div>
          {current.hint && <p><strong>{t('signHint')}:</strong> {current.hint}</p>}
          <div className="row">
            {current.verification === 'dictionary-match' && (
              <button className="btn btn-small" onClick={() => void st.setOverride(item.id, { signChoice: current.id, signReviewed: true }, `Confirmed the sign for “${word}”`)}>
                <Icon name="check" /> {t('markRight')}
              </button>
            )}
            {current.source && online && (
              <a className="btn btn-small" href={current.source} target="_blank" rel="noopener noreferrer"><Icon name="external" /> {t('openSource')}</a>
            )}
            {current.verification === 'custom' && (
              <button className="btn btn-small btn-danger" onClick={() => void st.deleteCustomSign(current.id)}><Icon name="trash" /> {t('delete')}</button>
            )}
          </div>
          {current.attribution && <p className="small muted">{t('signCredit')}</p>}
        </>
      )}
      {signs.length > 1 && (
        <div className="field" style={{ marginTop: 8 }}>
          <span className="label">{t('otherSigns')}</span>
          <div className="sign-alts">
            {signs.map((s, i) => (
              <button key={s.id} className="sign-alt" aria-pressed={i === index} onClick={() => setIndex(i)}>
                {s.image ? <img src={assetUrl(s.image)} alt="" /> : <span className="muted small">{s.verification === 'custom' ? t('customSign') : t('needsInternet')}</span>}
                <span className="small">{s.gloss}</span>
              </button>
            ))}
          </div>
          {index > 0 && current && (
            <button className="btn btn-small" style={{ marginTop: 8 }} onClick={() => { void st.setOverride(item.id, { signChoice: current.id, signReviewed: true }, `Chose a different sign for “${word}”`); setIndex(0); }}>
              {t('chooseSign')}
            </button>
          )}
        </div>
      )}
      {adding && <AddSign item={item} onClose={() => setAdding(false)} />}
    </section>
  );
}

function SignMedia({ sign, online, large }: { sign: SignResource; online: boolean; large?: boolean }) {
  const t = useT();
  const settings = useStore((s) => s.settings);
  const ref = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  const [slow, setSlow] = useState(settings.signSpeed < 1);
  const [loop, setLoop] = useState(settings.signLoop);
  const [playing, setPlaying] = useState(false);
  const blobUrl = useStoredImage(sign.blobId, 'full');
  useEffect(() => setFailed(false), [sign.id]);
  useEffect(() => {
    if (ref.current) ref.current.playbackRate = slow ? 0.5 : settings.signSpeed || 1;
  }, [slow, settings.signSpeed, sign.id]);

  if (sign.type === 'link' && sign.url) {
    return <a className="btn" href={sign.url} target="_blank" rel="noopener noreferrer"><Icon name="external" /> {sign.url}</a>;
  }
  const src = blobUrl ?? (sign.video ? assetUrl(sign.video) : online ? sign.remoteVideo : undefined);
  return (
    <div className="row" style={{ alignItems: 'stretch', gap: 12 }}>
      <div style={{ flex: '2 1 320px', minWidth: 0 }}>
        {src && !failed ? (
          <video
            key={src}
            ref={ref}
            className="sign-video"
            src={src}
            autoPlay
            muted
            playsInline
            loop={loop}
            controls={false}
            style={large ? { maxHeight: '60dvh' } : undefined}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onLoadedMetadata={(e) => (e.currentTarget.playbackRate = slow ? 0.5 : settings.signSpeed || 1)}
            onError={() => {
              // The bundled copy is not available offline yet: try the dictionary's own server.
              if (online && sign.remoteVideo && src !== sign.remoteVideo) {
                (ref.current as HTMLVideoElement).src = sign.remoteVideo;
              } else setFailed(true);
            }}
            aria-label={t('signFor', { word: sign.gloss })}
          />
        ) : (
          <p className="banner">{online ? t('noSign') : t('offlineVideoMissing')}</p>
        )}
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn btn-small" onClick={() => { const v = ref.current; if (!v) return; v.currentTime = 0; void v.play(); }}>
            <Icon name="repeat" /> {t('replay')}
          </button>
          <button className="btn btn-small" onClick={() => { const v = ref.current; if (!v) return; if (v.paused) void v.play(); else v.pause(); }}>
            <Icon name={playing ? 'pause' : 'play'} /> {playing ? t('pause') : t('play')}
          </button>
          <button className="btn btn-small" aria-pressed={slow} onClick={() => setSlow(!slow)}><Icon name="slow" /> {t('slow')}</button>
          <button className="btn btn-small" aria-pressed={loop} onClick={() => setLoop(!loop)}><Icon name="loop" /> {t('loop')}</button>
        </div>
      </div>
      {sign.image && (
        <div style={{ flex: '1 1 180px', maxWidth: 260 }}>
          <img src={assetUrl(sign.image)} alt={t('signDrawing')} style={{ width: '100%', background: '#fff', borderRadius: 10, border: '2px solid var(--border)' }} />
        </div>
      )}
    </div>
  );
}

/** Add a sign the person uses: a link to a video, or a video file kept on this device. */
function AddSign({ item, onClose }: { item: VocabItem; onClose: () => void }) {
  const t = useT();
  const st = useStore();
  const [url, setUrl] = useState('');
  const [gloss, setGloss] = useState(item.forms.en?.text ?? item.forms.zh?.hans ?? '');
  const fileRef = useRef<HTMLInputElement>(null);
  const base = { itemId: item.id, signLanguage: st.settings.signLanguage === 'none' ? 'nzsl' : st.settings.signLanguage, gloss, verification: 'custom' as const, rank: 0 };
  return (
    <Dialog title={t('addOwnSign')} size="small" onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>{t('cancel')}</button>
        <button className="btn btn-primary" disabled={!/^https?:\/\//.test(url)} onClick={async () => {
          await st.saveCustomSign({ ...base, id: newId('sign-'), type: 'link', url });
          onClose();
        }}>{t('save')}</button>
      </>}>
      <TextField label={t('sign')} value={gloss} onChange={setGloss} />
      <TextField label={t('signLink')} value={url} onChange={setUrl} type="url" placeholder="https://" />
      <button className="btn btn-block" onClick={() => fileRef.current?.click()}><Icon name="upload" /> {t('signVideoFile')}</button>
      <input ref={fileRef} type="file" accept="video/*" capture="user" hidden onChange={async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const blobId = await saveImageBlob(st.profileId, file);
        await st.saveCustomSign({ ...base, id: newId('sign-'), type: 'video', blobId });
        onClose();
      }} />
    </Dialog>
  );
}
