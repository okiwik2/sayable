// Settings. Plain-language labels, every change is reversible, and nothing here can remove the
// ability to say No, Stop or Help.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore, useT } from '../../state/store';
import { dataset } from '../../data/dataset';
import type { Settings, Contact } from '../../domain/settings';
import type { Lang } from '../../domain/types';
import { speech, voiceMatchesLang, type VoiceInfo } from '../../services/speech';
import { newId, listChanges, storageEstimate, requestPersistentStorage } from '../../services/repo';
import { exportProfiles, validateBackup, importBackup, listRestorePoints, restoreFrom, downloadJson } from '../../services/backup';
import { cleanupImages } from '../../services/images';
import { saveAllToCache } from '../../services/offline';
import { db } from '../../services/db';
import { Choices, Range, Toggle, TextField } from '../common';
import { Icon } from '../Icon';
import { assetUrl } from '../hooks';
import { SymbolImage } from '../Tile';
import { openWordEditor, requestHelperAccess } from '../Editing';
import type { VocabItem } from '../../domain/types';

const SECTIONS = [
  ['language', 'sLanguage', 'globe'],
  ['words', 'sMyWords', 'plus'],
  ['voice', 'sVoice', 'speak'],
  ['display', 'sDisplay', 'eye'],
  ['board', 'sBoard', 'core'],
  ['suggestions', 'sSuggestions', 'quick'],
  ['access', 'sAccess', 'hand'],
  ['signs', 'sSigns', 'hand'],
  ['safety', 'sSafety', 'shield'],
  ['profiles', 'sProfiles', 'person'],
  ['helpers', 'sHelpers', 'lock'],
  ['data', 'sData', 'download'],
  ['about', 'sAbout', 'info'],
] as const;

export function SettingsScreen({ section }: { section?: string }) {
  const t = useT();
  const go = useStore((s) => s.go);
  const current = section ?? 'language';
  return (
    <section className="screen" aria-labelledby="settings-title">
      <div className="screen-head">
        <h1 id="settings-title">{t('settingsTitle')}</h1>
        <button className="btn btn-small" style={{ marginLeft: 'auto' }} onClick={() => useStore.setState({ tutorialStep: 0, view: { screen: 'board' } })}>
          <Icon name="info" /> {t('sTutorial')}
        </button>
      </div>
      <div className="settings">
        <nav className="settings-nav" aria-label={t('settingsTitle')}>
          {SECTIONS.map(([id, key, icon]) => (
            <button key={id} className="btn" aria-current={current === id ? 'page' : undefined} aria-pressed={current === id}
              onClick={() => go({ screen: 'settings', section: id })}>
              <Icon name={icon} /> {t(key)}
            </button>
          ))}
        </nav>
        <div className="settings-body">
          {current === 'language' && <LanguageSettings />}
          {current === 'words' && <MyWordsSettings />}
          {current === 'voice' && <VoiceSettings />}
          {current === 'display' && <DisplaySettings />}
          {current === 'board' && <BoardSettings />}
          {current === 'suggestions' && <SuggestionSettings />}
          {current === 'access' && <AccessSettings />}
          {current === 'signs' && <SignSettings />}
          {current === 'safety' && <SafetySettings />}
          {current === 'profiles' && <ProfileSettings />}
          {current === 'helpers' && <HelperSettings />}
          {current === 'data' && <DataSettings />}
          {current === 'about' && <About />}
        </div>
      </div>
    </section>
  );
}

function useSettings(): [Settings, (p: Partial<Settings>) => void] {
  return [useStore((s) => s.settings), useStore((s) => s.updateSettings)];
}

function LanguageSettings() {
  const t = useT();
  const [s, set] = useSettings();
  return (
    <div className="section">
      <h2>{t('sLanguage')}</h2>
      <Choices label={t('uiLanguage')} value={s.uiLang} onChange={(v) => set({ uiLang: v })}
        options={[{ value: 'en', label: 'English' }, { value: 'zh', label: '中文（简体）' }]} />
      <Choices label={t('talkIn')} value={s.commLangs} onChange={(v) => set({ commLangs: v, activeLang: v === 'zh' ? 'zh' : v === 'en' ? 'en' : s.activeLang })}
        options={[{ value: 'en', label: t('langEn') }, { value: 'zh', label: `${t('langZh')} · 中文` }, { value: 'both', label: t('langBoth') }]} />
      {s.commLangs !== 'en' && (
        <>
          <Choices label={t('chineseScript')} value={s.traditional ? 'hant' : 'hans'} onChange={(v) => set({ traditional: v === 'hant' })}
            options={[{ value: 'hans', label: `${t('simplified')} 简体` }, { value: 'hant', label: `${t('traditional')} 繁體` }]} />
          <Toggle label={t('showPinyin')} checked={s.showPinyin} onChange={(v) => set({ showPinyin: v })} />
        </>
      )}
      {s.commLangs === 'both' && <Toggle label={t('showSecond')} checked={s.showSecondLanguage} onChange={(v) => set({ showSecondLanguage: v })} />}
    </div>
  );
}

/** Add, change and remove the person's own words, and undo changes to built-in words. */
function MyWordsSettings() {
  const t = useT();
  const st = useStore();
  const [q, setQ] = useState('');
  const uiLang = st.settings.uiLang;
  const query = q.trim().toLowerCase();
  const mine = st.customItems
    .map((i) => st.vocab.items.get(i.id))
    .filter((i): i is VocabItem => !!i)
    .filter((i) => !query || [i.forms.en?.text, i.forms.zh?.hans, i.forms.zh?.pinyin].some((x) => x?.toLowerCase().includes(query)));
  const changed = st.overrides.filter(
    (o) =>
      !st.customItems.some((c) => c.id === o.itemId) &&
      (o.label?.en || o.label?.zh || o.say?.en || o.say?.zh || o.imageId || o.symbol === null || o.hidden || o.keywords?.length || o.notes),
  );
  const topic = (item: VocabItem) => st.vocab.categories.get(item.category)?.name[uiLang] ?? item.category;
  const name = (item: VocabItem) => [item.forms.en?.text, item.forms.zh?.hans].filter(Boolean).join(' · ');
  const say = (item: VocabItem) =>
    item.forms.en ? st.sayWord(item.forms.en.say ?? item.forms.en.text, 'en') : st.sayWord(item.forms.zh?.say ?? item.forms.zh?.hans ?? '', 'zh');

  const row = (item: VocabItem, actions: React.ReactNode, tags: string[] = []) => (
    <li key={item.id} className="list-item">
      <span className="word-thumb" aria-hidden="true">
        {item.symbol ? <SymbolImage item={item} /> : <Icon name={item.kind === 'phrase' ? 'phrase' : 'image'} />}
      </span>
      <span className="grow">
        <span className="big">{name(item)}</span>
        <br />
        <span className="muted small">{t('inTopic', { name: topic(item) })}</span>
        {tags.map((x) => (
          <span key={x} className="tag" style={{ marginLeft: 6 }}>{x}</span>
        ))}
      </span>
      <button className="btn btn-small" onClick={() => say(item)} aria-label={`${t('hear')}: ${name(item)}`}>
        <Icon name="speak" />
      </button>
      {actions}
    </li>
  );

  return (
    <>
      <div className="section">
        <h2>{t('sMyWords')}</h2>
        <p>{t('myWordsIntro')}</p>
        <div className="row">
          <button className="btn btn-primary" style={{ minHeight: 56 }} onClick={() => void openWordEditor({ categoryId: 'people' })}>
            <Icon name="plus" /> {t('addMyWord')}
          </button>
          <button className="btn" style={{ minHeight: 56 }} onClick={() => void openWordEditor({ categoryId: 'social', pos: 'phrase' })}>
            <Icon name="phrase" /> {t('addMyPhrase')}
          </button>
        </div>
      </div>
      <div className="section">
        <h2>{t('myWordsCount', { n: st.customItems.length })}</h2>
        {st.customItems.length > 6 && <TextField label={t('findMyWords')} value={q} onChange={setQ} />}
        {st.customItems.length === 0 ? (
          <p className="muted">{t('myWordsEmpty')}</p>
        ) : (
          <ul className="list">
            {mine.map((item) =>
              row(
                item,
                <>
                  <button className="btn btn-small" onClick={() => void openWordEditor({ itemId: item.id })}>
                    <Icon name="edit" /> {t('edit')}
                  </button>
                  <button
                    className="btn btn-small btn-danger"
                    onClick={async () => {
                      if (!(await requestHelperAccess())) return;
                      if (await st.confirm({ text: t('deleteWordConfirm', { word: name(item) }), danger: true, confirmLabel: t('delete') })) {
                        await st.deleteCustomItem(item.id);
                      }
                    }}
                  >
                    <Icon name="trash" /> {t('delete')}
                  </button>
                </>,
              ),
            )}
          </ul>
        )}
      </div>
      {changed.length > 0 && (
        <div className="section">
          <h2>{t('changedWords', { n: changed.length })}</h2>
          <p className="muted">{t('changedHelp')}</p>
          <ul className="list">
            {changed.map((o) => {
              const item = st.vocab.items.get(o.itemId);
              if (!item) return null;
              const tags = [
                o.imageId ? t('tagPicture') : '',
                o.symbol === null ? t('tagNoPicture') : '',
                o.label?.en || o.label?.zh ? t('tagLabel') : '',
                o.say?.en || o.say?.zh ? t('tagSay') : '',
                o.hidden ? t('hidden') : '',
              ].filter(Boolean);
              return row(
                item,
                <>
                  <button className="btn btn-small" onClick={() => void openWordEditor({ itemId: item.id })}>
                    <Icon name="edit" /> {t('edit')}
                  </button>
                  <button
                    className="btn btn-small"
                    onClick={async () => {
                      if (await requestHelperAccess()) await st.resetOverride(item.id);
                    }}
                  >
                    <Icon name="undo" /> {t('resetWord')}
                  </button>
                </>,
                tags,
              );
            })}
          </ul>
        </div>
      )}
    </>
  );
}

function useVoices(): VoiceInfo[] {
  const [voices, setVoices] = useState(speech.listVoices());
  useEffect(() => speech.onVoicesChanged(() => setVoices(speech.listVoices())), []);
  return voices;
}

function VoicePicker({ lang }: { lang: Lang }) {
  const t = useT();
  const [s, set] = useSettings();
  const voices = useVoices().filter((v) => voiceMatchesLang(v, lang));
  const sayTest = useStore((st) => st.sayWord);
  const langName = lang === 'en' ? t('langEn') : t('langZh');
  return (
    <div className="field">
      <label htmlFor={`voice-${lang}`}>{lang === 'en' ? t('englishVoice') : t('mandarinVoice')}</label>
      {voices.length ? (
        <div className="row">
          <select id={`voice-${lang}`} className="input" style={{ flex: 1, minWidth: 220 }} value={s.voices[lang] ?? ''}
            onChange={(e) => set({ voices: { ...s.voices, [lang]: e.target.value || undefined } })}>
            <option value="">{t('automatic')}</option>
            {voices.map((v) => (
              <option key={v.id} value={v.id}>{v.name} · {v.lang}{v.local ? '' : ` · ${t('voiceOnline')}`}</option>
            ))}
          </select>
          <button className="btn" onClick={() => sayTest(lang === 'en' ? t('voiceTest') : t('voiceTestZh'), lang)}>
            <Icon name="speak" /> {t('testVoice')}
          </button>
        </div>
      ) : (
        <div className="banner">
          <span>{t('noVoice', { lang: langName })} {t('noVoiceHelp')}</span>
        </div>
      )}
    </div>
  );
}

function VoiceSettings() {
  const t = useT();
  const [s, set] = useSettings();
  const pron = s.pronunciations;
  return (
    <>
      <div className="section">
        <h2>{t('sVoice')}</h2>
        {!speech.supported && <p className="banner">{t('noSpeech')}</p>}
        <p className="muted">{t('voicesFromDevice')}</p>
        {(s.commLangs === 'en' || s.commLangs === 'both') && <VoicePicker lang="en" />}
        {(s.commLangs === 'zh' || s.commLangs === 'both') && <VoicePicker lang="zh" />}
        <Range label={t('speed')} value={s.rate} min={0.5} max={1.8} step={0.05} onChange={(v) => set({ rate: v })} display={(v) => `${v.toFixed(2)}×`} />
        <Range label={t('pitch')} value={s.pitch} min={0.5} max={1.6} step={0.05} onChange={(v) => set({ pitch: v })} display={(v) => v.toFixed(2)} />
        <Range label={t('volume')} value={s.volume} min={0.1} max={1} step={0.05} onChange={(v) => set({ volume: v })} display={(v) => `${Math.round(v * 100)}%`} />
        <Range label={t('previewVolume')} value={s.previewVolume} min={0.05} max={0.8} step={0.05} onChange={(v) => set({ previewVolume: v })} display={(v) => `${Math.round(v * 100)}%`} />
        {s.commLangs === 'both' && (
          <Range label={t('langPause')} value={s.pauseBetweenLangsMs} min={0} max={1000} step={50} onChange={(v) => set({ pauseBetweenLangsMs: v })} display={(v) => t('ms', { n: v })} />
        )}
        <Toggle label={t('speakEachWord')} checked={s.speakEachWord} onChange={(v) => set({ speakEachWord: v })} />
      </div>
      <div className="section">
        <h2>{t('pronFixes')}</h2>
        <ul className="list">
          {pron.map((p, i) => (
            <li key={p.id} className="list-item">
              <select className="input" style={{ width: 110 }} value={p.lang} aria-label={t('sLanguage')}
                onChange={(e) => set({ pronunciations: pron.map((x, j) => (j === i ? { ...x, lang: e.target.value as Lang } : x)) })}>
                <option value="en">English</option>
                <option value="zh">中文</option>
              </select>
              <input className="input" style={{ flex: 1, minWidth: 120 }} aria-label={t('pronWritten')} placeholder={t('pronWritten')} value={p.written}
                onChange={(e) => set({ pronunciations: pron.map((x, j) => (j === i ? { ...x, written: e.target.value } : x)) })} />
              <input className="input" style={{ flex: 1, minWidth: 120 }} aria-label={t('pronSpoken')} placeholder={t('pronSpoken')} value={p.spoken}
                onChange={(e) => set({ pronunciations: pron.map((x, j) => (j === i ? { ...x, spoken: e.target.value } : x)) })} />
              <button className="btn btn-small" onClick={() => useStore.getState().sayWord(p.written, p.lang)}><Icon name="speak" /></button>
              <button className="btn btn-small btn-danger" aria-label={t('delete')} onClick={() => set({ pronunciations: pron.filter((_, j) => j !== i) })}><Icon name="trash" /></button>
            </li>
          ))}
        </ul>
        <button className="btn" style={{ marginTop: 8 }} onClick={() => set({ pronunciations: [...pron, { id: newId('pr'), lang: 'en', written: '', spoken: '' }] })}>
          <Icon name="plus" /> {t('addPronFix')}
        </button>
      </div>
    </>
  );
}

function DisplaySettings() {
  const t = useT();
  const [s, set] = useSettings();
  return (
    <div className="section">
      <h2>{t('sDisplay')}</h2>
      <Choices label={t('theme')} value={s.theme} onChange={(v) => set({ theme: v })} options={[
        { value: 'system', label: t('themeSystem') }, { value: 'light', label: t('themeLight') }, { value: 'dark', label: t('themeDark') },
        { value: 'contrast-light', label: t('themeContrastLight') }, { value: 'contrast-dark', label: t('themeContrastDark') },
      ]} />
      <Choices label={t('tileStyle')} value={s.tileStyle} onChange={(v) => set({ tileStyle: v })} options={[
        { value: 'symbol-text', label: t('tileSymbolText') }, { value: 'text', label: t('tileText') }, { value: 'symbol', label: t('tileSymbol') },
      ]} />
      <Range label={t('textSize')} value={s.textScale} min={0.85} max={1.8} step={0.05} onChange={(v) => set({ textScale: v })} display={(v) => `${Math.round(v * 100)}%`} />
      <Choices label={t('tileSize')} value={s.tileSize} onChange={(v) => set({ tileSize: v })} options={[
        { value: 'small', label: t('sizeSmall') }, { value: 'medium', label: t('sizeMedium') }, { value: 'large', label: t('sizeLarge') }, { value: 'xlarge', label: t('sizeXLarge') },
      ]} />
      <Choices label={t('density')} value={s.density} onChange={(v) => set({ density: v })} options={[
        { value: 'comfortable', label: t('comfortable') }, { value: 'compact', label: t('compact') },
      ]} />
      <Choices label={t('colourCoding')} value={s.colourCoding} onChange={(v) => set({ colourCoding: v })} options={[
        { value: 'word-type', label: t('byWordType') }, { value: 'category', label: t('byTopic') }, { value: 'none', label: t('noColour') },
      ]} />
      <Choices label={t('palette')} value={s.palette} onChange={(v) => set({ palette: v })} options={[
        { value: 'standard', label: t('paletteStandard') }, { value: 'colour-blind', label: t('paletteCB') },
      ]} />
      <Toggle label={t('simpleView')} checked={s.simplified} onChange={(v) => set({ simplified: v })} />
      <Toggle label={t('reduceMotion')} checked={s.reduceMotion} onChange={(v) => set({ reduceMotion: v })} />
      <Toggle label={t('labelsOnTop')} checked={s.labelsOnTop} onChange={(v) => set({ labelsOnTop: v })} />
    </div>
  );
}

function BoardSettings() {
  const t = useT();
  const [s, set] = useSettings();
  const items = useStore((st) => st.vocab.items);
  return (
    <div className="section">
      <h2>{t('sBoard')}</h2>
      <Choices label={t('coreSize')} value={s.coreLevel} onChange={(v) => set({ coreLevel: v })} help={t('obBoardHelp')} options={[
        { value: 'starter', label: t('coreStarter') }, { value: 'standard', label: t('coreStandard') }, { value: 'extended', label: t('coreExtended') },
      ]} />
      <Range label={t('columns')} value={s.columns} min={0} max={12} step={1} onChange={(v) => set({ columns: v })} display={(v) => (v ? String(v) : t('automatic'))} />
      <Toggle label={t('returnToCore')} checked={s.returnToCoreAfterTopicWord} onChange={(v) => set({ returnToCoreAfterTopicWord: v })} />
      <Toggle label={t('adaptive')} help={t('adaptiveHelp')} checked={s.adaptiveOrder} onChange={(v) => set({ adaptiveOrder: v })} />
      <Toggle label={t('recentRow')} checked={s.showRecentRow} onChange={(v) => set({ showRecentRow: v })} />
      <Toggle label={t('phraseSpeakNow')} checked={s.phraseTilesSpeakNow} onChange={(v) => set({ phraseTilesSpeakNow: v })} />
      <Choices label={t('quickBehaviour')} value={s.quickBehaviour} onChange={(v) => set({ quickBehaviour: v })} options={[
        { value: 'keep', label: t('quickKeep') }, { value: 'replace', label: t('quickReplace') }, { value: 'append', label: t('quickAppend') }, { value: 'ask', label: t('askMe') },
      ]} />
      <Toggle label={t('autoCapitalize')} checked={s.autoCapitalize} onChange={(v) => set({ autoCapitalize: v })} />
      <Toggle label={t('autoPunctuate')} checked={s.autoPunctuate} onChange={(v) => set({ autoPunctuate: v })} />
      <Toggle label={t('restoreUnfinished')} checked={s.restoreUnfinished} onChange={(v) => set({ restoreUnfinished: v })} />
      <div className="field">
        <span className="label">{t('pinnedEdit')}</span>
        <span className="help">{t('essentialNote')}</span>
        <ul className="list">
          {s.pinned.map((id, i) => {
            const item = items.get(id);
            return (
              <li key={id} className="list-item">
                <span className="grow">{item?.forms.en?.text ?? item?.forms.zh?.hans ?? id}</span>
                <button className="btn btn-small" disabled={i === 0} aria-label={t('moveLeft')} onClick={() => { const p = [...s.pinned]; [p[i - 1], p[i]] = [p[i]!, p[i - 1]!]; set({ pinned: p }); }}><Icon name="up" /></button>
                <button className="btn btn-small" disabled={i === s.pinned.length - 1} aria-label={t('moveRight')} onClick={() => { const p = [...s.pinned]; [p[i + 1], p[i]] = [p[i]!, p[i + 1]!]; set({ pinned: p }); }}><Icon name="down" /></button>
                <button className="btn btn-small btn-danger" onClick={async () => {
                  const st = useStore.getState();
                  if (await st.confirm({ text: `${t('remove')}: ${item?.forms.en?.text ?? id}?`, detail: t('essentialNote'), confirmLabel: t('remove') })) {
                    set({ pinned: s.pinned.filter((x) => x !== id) });
                    void st.logChange(`Removed “${item?.forms.en?.text ?? id}” from quick replies`);
                  }
                }}><Icon name="clear" /> {t('remove')}</button>
              </li>
            );
          })}
        </ul>
        <p className="small muted">{t('navQuick')} → {t('editQuick')}</p>
      </div>
    </div>
  );
}

function SuggestionSettings() {
  const t = useT();
  const [s, set] = useSettings();
  const clearLearned = useStore((st) => st.clearLearned);
  const confirm = useStore((st) => st.confirm);
  return (
    <div className="section">
      <h2>{t('sSuggestions')}</h2>
      <Toggle label={t('predictNext')} checked={s.predictions} onChange={(v) => set({ predictions: v })} />
      <Toggle label={t('grammarHelp')} help={t('suggestionNote')} checked={s.grammarHelp} onChange={(v) => set({ grammarHelp: v })} />
      <Toggle label={t('learnFromMe')} checked={s.learnFromMe} onChange={(v) => set({ learnFromMe: v })} />
      <Toggle label={t('keepHistory')} checked={s.keepHistory} onChange={(v) => set({ keepHistory: v })} />
      <button className="btn btn-danger" onClick={async () => { if (await confirm({ text: t('clearLearnedConfirm'), danger: true, confirmLabel: t('clearLearned') })) await clearLearned(); }}>
        <Icon name="trash" /> {t('clearLearned')}
      </button>
    </div>
  );
}

function AccessSettings() {
  const t = useT();
  const [s, set] = useSettings();
  return (
    <div className="section">
      <h2>{t('sAccess')}</h2>
      <Choices label={t('activation')} value={s.activation} onChange={(v) => set({ activation: v })} options={[
        { value: 'release', label: t('actRelease') }, { value: 'press', label: t('actPress') }, { value: 'hold', label: t('actHold') },
      ]} />
      {s.activation === 'hold' && (
        <Range label={t('holdTime')} value={s.holdMs} min={150} max={2000} step={50} onChange={(v) => set({ holdMs: v })} display={(v) => t('seconds', { n: (v / 1000).toFixed(2) })} />
      )}
      <Range label={t('debounce')} value={s.debounceMs} min={0} max={2000} step={100} onChange={(v) => set({ debounceMs: v })} display={(v) => (v ? t('seconds', { n: (v / 1000).toFixed(1) }) : t('off'))} />
      <Toggle label={t('dwell')} checked={s.dwell} onChange={(v) => set({ dwell: v })} />
      {s.dwell && <Range label={t('dwellTime')} value={s.dwellMs} min={400} max={3000} step={100} onChange={(v) => set({ dwellMs: v })} display={(v) => t('seconds', { n: (v / 1000).toFixed(1) })} />}
      <Choices label={t('scanning')} help={t('scanHelp')} value={s.scanMode} onChange={(v) => set({ scanMode: v })} options={[
        { value: 'off', label: t('scanOff') }, { value: 'auto', label: t('scanAuto') }, { value: 'step', label: t('scanStep') },
      ]} />
      {s.scanMode === 'auto' && <Range label={t('scanSpeed')} value={s.scanMs} min={500} max={4000} step={100} onChange={(v) => set({ scanMs: v })} display={(v) => t('seconds', { n: (v / 1000).toFixed(1) })} />}
      <Toggle label={t('haptics')} checked={s.haptics} onChange={(v) => set({ haptics: v })} />
      <Toggle label={t('confirmClear')} checked={s.confirmClear} onChange={(v) => set({ confirmClear: v })} />
      <p className="small muted">
        <span className="kbd">Ctrl</span>+<span className="kbd">Enter</span> {t('speak')} · <span className="kbd">Esc</span> {t('stopSpeaking')} ·{' '}
        <span className="kbd">Ctrl</span>+<span className="kbd">Z</span> {t('undo')} · <span className="kbd">i</span> {t('more')}
      </p>
    </div>
  );
}

function SignSettings() {
  const t = useT();
  const [s, set] = useSettings();
  const st = useStore();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  useEffect(() => void st.loadSigns(), [st]);

  const save = async (onlyFavourites: boolean) => {
    const pack = await st.loadSigns();
    if (!pack || !('caches' in window)) return;
    const itemIds = onlyFavourites ? st.overrides.filter((o) => o.favourite).map((o) => o.itemId) : Object.keys(pack.links);
    const urls = new Set<string>();
    for (const id of itemIds) {
      const sid = pack.links[id]?.[0];
      const sign = sid ? pack.signs[sid] : undefined;
      if (sign?.video) urls.add(sign.video);
    }
    const list = [...urls].map((path) => new URL(assetUrl(path), location.href).href);
    const result = await saveAllToCache('nzsl-video', list, (done, total) => setProgress({ done, total }), 6);
    setProgress(null);
    if (result.total > 0 && result.saved === 0) st.toast({ text: t('signOfflineNone') });
    else st.toast({ text: t('signOfflineDone', { n: list.length - result.failed }), tone: 'success' });
  };

  return (
    <div className="section">
      <h2>{t('sSigns')}</h2>
      <Choices label={t('signLanguage')} value={s.signLanguage} onChange={(v) => set({ signLanguage: v })} options={[
        { value: 'nzsl', label: t('signNZSL') }, { value: 'asl', label: t('signASL') }, { value: 'bsl', label: t('signBSL') }, { value: 'none', label: t('signNone') },
      ]} />
      {(s.signLanguage === 'asl' || s.signLanguage === 'bsl') && <p className="banner">{t('noSignLang', { lang: s.signLanguage.toUpperCase() })}</p>}
      <Toggle label={t('signIndicator')} checked={s.showSignIndicator} onChange={(v) => set({ showSignIndicator: v })} />
      <Range label={t('signSpeedSetting')} value={s.signSpeed} min={0.25} max={1.5} step={0.25} onChange={(v) => set({ signSpeed: v })} display={(v) => `${v}×`} />
      <Toggle label={t('signLoopSetting')} checked={s.signLoop} onChange={(v) => set({ signLoop: v })} />
      {s.signLanguage === 'nzsl' && (
        <div className="field">
          <span className="label">{t('signOffline')}</span>
          <span className="help">{t('signOfflineHelp')}</span>
          {progress ? (
            <p role="status">{t('signOfflineProgress', progress)}</p>
          ) : (
            <div className="row">
              <button className="btn" onClick={() => void save(true)}><Icon name="star" /> {t('signOfflineFavs')}</button>
              <button className="btn" onClick={() => void save(false)}><Icon name="download" /> {t('signOfflineAll')}</button>
              <button className="btn btn-danger" onClick={async () => { await caches.delete('nzsl-video'); st.toast({ text: t('done') }); }}>
                <Icon name="trash" /> {t('signOfflineRemove')}
              </button>
            </div>
          )}
        </div>
      )}
      <p className="small muted">{t('signCredit')}</p>
      <p className="small muted">{t('disclaimerSign')}</p>
    </div>
  );
}

function SafetySettings() {
  const t = useT();
  const [s, set] = useSettings();
  const me = s.aboutMe;
  const setMe = (p: Partial<Settings['aboutMe']>) => set({ aboutMe: { ...me, ...p } });
  const setContact = (i: number, p: Partial<Contact>) => set({ contacts: s.contacts.map((c, j) => (j === i ? { ...c, ...p } : c)) });
  return (
    <>
      <div className="section">
        <h2>{t('emergencyMessage')}</h2>
        <TextField label={t('emergencyMessage')} value={s.emergencyMessage} onChange={(v) => set({ emergencyMessage: v })} multiline placeholder={t('emergencyDefault')} />
      </div>
      <div className="section">
        <h2>{t('aboutMe')}</h2>
        <TextField label={t('myName')} value={me.name} onChange={(v) => setMe({ name: v })} />
        <TextField label={t('howICommunicate')} value={me.communication} onChange={(v) => setMe({ communication: v })} multiline />
        <TextField label={t('medicalInfo')} value={me.medical} onChange={(v) => setMe({ medical: v })} multiline />
        <TextField label={t('allergies')} value={me.allergies} onChange={(v) => setMe({ allergies: v })} />
        <TextField label={t('otherInfo')} value={me.other} onChange={(v) => setMe({ other: v })} multiline />
      </div>
      <div className="section">
        <h2>{t('contacts')}</h2>
        <p className="small muted">{t('callNote')}</p>
        {s.contacts.map((c, i) => (
          <div key={c.id} className="list-item" style={{ marginBottom: 8 }}>
            <div className="grow"><TextField label={t('contactName')} value={c.name} onChange={(v) => setContact(i, { name: v })} /></div>
            <div className="grow"><TextField label={t('contactRelation')} value={c.relation} onChange={(v) => setContact(i, { relation: v })} /></div>
            <div className="grow"><TextField label={t('contactPhone')} value={c.phone} type="tel" inputMode="tel" onChange={(v) => setContact(i, { phone: v })} /></div>
            <button className="btn btn-danger btn-small" aria-label={t('delete')} onClick={() => set({ contacts: s.contacts.filter((_, j) => j !== i) })}><Icon name="trash" /></button>
          </div>
        ))}
        <button className="btn" onClick={() => set({ contacts: [...s.contacts, { id: newId('c'), name: '', relation: '', phone: '' }] })}><Icon name="plus" /> {t('addContact')}</button>
      </div>
    </>
  );
}

function ProfileSettings() {
  const t = useT();
  const st = useStore();
  const [name, setName] = useState('');
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  return (
    <div className="section">
      <h2>{t('profilesTitle')}</h2>
      <p className="muted">{t('profilesHelp')}</p>
      <ul className="list">
        {st.profiles.map((p) => (
          <li key={p.id} className="list-item">
            {renaming?.id === p.id ? (
              <form className="row grow" onSubmit={async (e) => { e.preventDefault(); await st.renameProfile(p.id, renaming.name); setRenaming(null); }}>
                <input className="input" style={{ flex: 1 }} value={renaming.name} onChange={(e) => setRenaming({ id: p.id, name: e.target.value })} aria-label={t('profileName')} autoFocus />
                <button className="btn btn-primary" type="submit">{t('save')}</button>
              </form>
            ) : (
              <span className="grow big">{p.name} {p.id === st.profileId && <span className="tag">{t('currentProfile')}</span>}</span>
            )}
            {p.id !== st.profileId && <button className="btn" onClick={() => void st.switchProfile(p.id)}>{t('switchTo')}</button>}
            <button className="btn btn-small" onClick={() => setRenaming({ id: p.id, name: p.name })}><Icon name="edit" /> {t('renameProfile')}</button>
            <button className="btn btn-small btn-danger" onClick={async () => {
              if (await st.confirm({ text: t('deleteProfileConfirm', { name: p.name }), danger: true, confirmLabel: t('deleteProfile') })) await st.deleteProfile(p.id);
            }}><Icon name="trash" /> {t('deleteProfile')}</button>
          </li>
        ))}
      </ul>
      <form className="row" style={{ marginTop: 12, alignItems: 'flex-end' }} onSubmit={async (e) => { e.preventDefault(); if (name.trim()) { await st.addProfile(name.trim()); setName(''); } }}>
        <div style={{ flex: 1 }}><TextField label={t('profileName')} value={name} onChange={setName} /></div>
        <button className="btn btn-primary" type="submit" style={{ marginBottom: 12 }}><Icon name="plus" /> {t('addProfile')}</button>
      </form>
    </div>
  );
}

function HelperSettings() {
  const t = useT();
  const [s, set] = useSettings();
  const profileId = useStore((st) => st.profileId);
  const [pin, setPin] = useState('');
  const [changes, setChanges] = useState<{ at: number; by: string; summary: string }[]>([]);
  useEffect(() => {
    listChanges(profileId).then(setChanges).catch(() => {});
  }, [profileId]);
  return (
    <>
      <div className="section">
        <h2>{t('sHelpers')}</h2>
        <Toggle label={t('editLock')} help={t('editLockHelp')} checked={s.editLock && !!s.editPin} onChange={(v) => {
          if (!v) set({ editLock: false });
          else if (s.editPin) set({ editLock: true });
          else useStore.getState().toast({ text: t('setPin'), tone: 'warn' });
        }} />
        <form className="row" style={{ alignItems: 'flex-end' }} onSubmit={(e) => {
          e.preventDefault();
          if (/^\d{4,8}$/.test(pin)) {
            set({ editPin: pin, editLock: true });
            setPin('');
            useStore.getState().toast({ text: t('saved'), tone: 'success' });
          }
        }}>
          <div style={{ flex: 1 }}><TextField label={t('setPin')} value={pin} onChange={(v) => setPin(v.replace(/\D/g, '').slice(0, 8))} type="password" inputMode="numeric" placeholder={t('pinPlaceholder')} /></div>
          <button className="btn btn-primary" style={{ marginBottom: 12 }} type="submit" disabled={!/^\d{4,8}$/.test(pin)}>{t('save')}</button>
        </form>
      </div>
      <div className="section">
        <h2>{t('changeLog')}</h2>
        <p className="muted">{t('changeLogHelp')}</p>
        {changes.length ? (
          <ul className="list">
            {changes.map((c, i) => (
              <li key={i} className="list-item">
                <span className="grow">{c.summary}</span>
                <span className="tag">{c.by === 'helper' ? t('byHelper') : t('byUser')}</span>
                <span className="muted small">{new Date(c.at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        ) : <p className="muted">{t('noChanges')}</p>}
      </div>
    </>
  );
}

function DataSettings() {
  const t = useT();
  const st = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [points, setPoints] = useState<{ id: number; at: number; reason: string }[]>([]);
  const [usage, setUsage] = useState<{ usage: number; quota: number } | null>(null);
  const refresh = () => {
    listRestorePoints().then(setPoints).catch(() => {});
    storageEstimate().then(setUsage).catch(() => {});
  };
  useEffect(refresh, []);
  const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;

  const inUse = useMemo(() => {
    const ids = new Set<string>();
    for (const o of st.overrides) if (o.imageId) ids.add(o.imageId);
    for (const i of st.customItems) if (i.symbol?.set === 'custom') ids.add(String(i.symbol.id));
    for (const s of st.customSigns) if (s.blobId) ids.add(s.blobId);
    return ids;
  }, [st.overrides, st.customItems, st.customSigns]);

  return (
    <>
      <div className="section">
        <h2>{t('sData')}</h2>
        <p className="banner info"><Icon name="shield" /> {t('privacyNote')}</p>
        {usage && <p>{t('storageUsed')}: {mb(usage.usage)}{usage.quota ? ` / ${mb(usage.quota)}` : ''}</p>}
        <div className="row">
          <button className="btn btn-primary" onClick={async () => downloadJson(await exportProfiles(), `sayable-backup-${new Date().toISOString().slice(0, 10)}.json`)}>
            <Icon name="download" /> {t('exportBackup')}
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}><Icon name="upload" /> {t('importBackup')}</button>
          <button className="btn" onClick={async () => st.toast({ text: (await requestPersistentStorage()) ? t('done') : t('error') })}>
            <Icon name="lock" /> {t('persistentStorage')}
          </button>
        </div>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          let parsed;
          try {
            parsed = validateBackup(JSON.parse(await file.text()));
          } catch {
            parsed = { ok: false, errors: [t('importFailed')] };
          }
          if (!parsed.ok || !('value' in parsed) || !parsed.value) {
            st.toast({ text: `${t('importFailed')} ${parsed.errors.join(' ')}`, tone: 'error', ms: 8000 });
            return;
          }
          const mode = await st.confirm({
            text: t('importMode'),
            detail: t('importReplaceWarn'),
            options: [{ label: t('importAdd'), value: 'add' }, { label: t('importReplace'), value: 'replace', danger: true }],
          });
          if (!mode) return;
          try {
            await importBackup(parsed.value, mode as 'add' | 'replace');
            await st.reloadProfile();
            useStore.getState().toast({ text: t('importDone'), tone: 'success' });
            refresh();
          } catch {
            st.toast({ text: t('importFailed'), tone: 'error' });
          }
        }} />
      </div>
      <div className="section">
        <h2>{t('restorePoints')}</h2>
        <p className="muted">{t('restorePointsHelp')}</p>
        {points.length ? (
          <ul className="list">
            {points.map((p) => (
              <li key={p.id} className="list-item">
                <span className="grow">{new Date(p.at).toLocaleString()} · {p.reason}</span>
                <button className="btn" onClick={async () => {
                  if (await st.confirm({ text: t('restoreConfirm'), confirmLabel: t('restore') })) {
                    await restoreFrom(p.id);
                    await st.reloadProfile();
                    refresh();
                  }
                }}>{t('restore')}</button>
              </li>
            ))}
          </ul>
        ) : <p className="muted">{t('noVersions')}</p>}
      </div>
      <div className="section">
        <div className="stack">
          <button className="btn" onClick={async () => st.toast({ text: t('cleanedImages', { n: await cleanupImages(st.profileId, inUse) }) })}>
            <Icon name="image" /> {t('cleanImages')}
          </button>
          <button className="btn btn-danger" onClick={async () => {
            if (await st.confirm({ text: t('clearHistoryConfirm'), danger: true, confirmLabel: t('clearHistory') })) await st.clearHistory();
          }}><Icon name="history" /> {t('clearHistory')}</button>
          <button className="btn btn-danger" onClick={async () => {
            if (!(await st.confirm({ text: t('deleteAllConfirm'), danger: true, confirmLabel: t('deleteAll') }))) return;
            if (!(await st.confirm({ text: t('deleteAllConfirm2'), danger: true, confirmLabel: t('deleteAll'), typeToConfirm: 'DELETE' }))) return;
            await db.delete();
            try { localStorage.clear(); } catch { /* ignore */ }
            location.reload();
          }}><Icon name="trash" /> {t('deleteAll')}</button>
        </div>
      </div>
    </>
  );
}

function About() {
  const t = useT();
  return (
    <div className="section">
      <h2>{t('appName')}</h2>
      <p>{t('aboutText')}</p>
      <p className="muted">{t('version', { v: __APP_VERSION__ })} · {dataset.items.length} words and phrases</p>
      <h3>Credits</h3>
      <p>{t('creditsSymbols')} <a href="https://arasaac.org" target="_blank" rel="noopener noreferrer">arasaac.org</a></p>
      <p>{t('creditsSigns')} <a href="https://www.nzsl.nz" target="_blank" rel="noopener noreferrer">www.nzsl.nz</a></p>
      <p className="muted">{t('creditsNC')}</p>
      <h3>Notes</h3>
      <p className="muted">{t('disclaimerVocab')}</p>
      <p className="muted">{t('disclaimerZh')}</p>
      <p className="muted">{t('disclaimerSign')}</p>
    </div>
  );
}
