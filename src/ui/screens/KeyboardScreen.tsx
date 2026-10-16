// Spelling and typing: a large on-screen keyboard with word completion. In Mandarin, letters
// are read as pinyin and matching words from the vocabulary are offered as characters.
import { useMemo, useState } from 'react';
import { useStore, useT } from '../../state/store';
import { primaryLang } from '../../domain/settings';
import { typedToken } from '../../domain/sentence';
import { normalizeLatin } from '../../domain/search';
import type { VocabItem } from '../../domain/types';
import { Icon } from '../Icon';

const LETTERS = ['qwertyuiop', "asdfghjkl'", 'zxcvbnm,.?'];
const NUMBERS = ['1234567890', '-/:;()$&@"', '!?.,+=%#*_'];

export function KeyboardScreen() {
  const t = useT();
  const st = useStore();
  const lang = primaryLang(st.settings);
  const [text, setText] = useState('');
  const [pinyinBuf, setPinyinBuf] = useState('');
  const [shift, setShift] = useState(true);
  const [numbers, setNumbers] = useState(false);
  const [device, setDevice] = useState(false);
  const zhMode = lang === 'zh';

  const partial = zhMode ? pinyinBuf : (text.match(/[A-Za-z']+$/)?.[0] ?? '');
  const completions = useMemo(() => {
    const p = normalizeLatin(partial);
    if (!p) return [] as { label: string; item?: VocabItem }[];
    const out: { label: string; item?: VocabItem; score: number }[] = [];
    const seen = new Set<string>();
    for (const item of st.vocab.items.values()) {
      if (item.kind === 'phrase') continue;
      if (zhMode) {
        const zh = item.forms.zh;
        if (!zh || !zh.pinyinPlain.startsWith(p.replace(/\s/g, ''))) continue;
        const label = st.settings.traditional ? zh.hant : zh.hans;
        if (seen.has(label)) continue;
        seen.add(label);
        out.push({ label, item, score: item.frequency + (zh.pinyinPlain === p ? 1 : 0) + Math.log2(1 + (st.data.usage[item.id]?.count ?? 0)) });
      } else {
        const en = item.forms.en?.text;
        if (!en || /\s/.test(en) || !en.toLowerCase().startsWith(p) || seen.has(en.toLowerCase())) continue;
        seen.add(en.toLowerCase());
        out.push({ label: en, item, score: item.frequency + Math.log2(1 + (st.data.usage[item.id]?.count ?? 0)) - en.length * 0.01 });
      }
    }
    return out.sort((a, b) => b.score - a.score).slice(0, 10);
  }, [partial, zhMode, st.vocab, st.data.usage, st.settings.traditional]);

  const type = (ch: string) => {
    if (zhMode && /[a-z]/i.test(ch)) {
      setPinyinBuf((b) => b + ch.toLowerCase());
      return;
    }
    if (zhMode && pinyinBuf) {
      // A non-letter ends the pinyin: keep it as typed letters.
      setText((x) => x + pinyinBuf);
      setPinyinBuf('');
    }
    setText((x) => x + (shift && !numbers ? ch.toUpperCase() : ch));
    if (shift) setShift(false);
  };
  const backspace = () => {
    if (pinyinBuf) setPinyinBuf((b) => b.slice(0, -1));
    else setText((x) => [...x].slice(0, -1).join(''));
  };
  const complete = (c: { label: string }) => {
    if (zhMode) {
      setText((x) => x + c.label);
      setPinyinBuf('');
    } else setText((x) => x.slice(0, x.length - partial.length) + c.label + ' ');
  };
  const full = (text + pinyinBuf).trim();
  const tokensFromText = () => {
    if (!full) return [];
    if (/[㐀-鿿]/.test(full)) return [typedToken(full, 'zh')];
    return full.split(/\s+/).map((w) => typedToken(w, 'en'));
  };
  const add = () => {
    st.addTokens(tokensFromText());
    setText('');
    setPinyinBuf('');
    setShift(true);
  };

  const rows = numbers ? NUMBERS : LETTERS;
  return (
    <section className="screen" aria-labelledby="kb-title">
      <div className="screen-head">
        <h1 id="kb-title">{t('keyboardTitle')}</h1>
        {zhMode && <span className="muted">{t('typePinyin')}</span>}
        <button className="btn btn-small" style={{ marginLeft: 'auto' }} aria-pressed={device} onClick={() => setDevice(!device)}>
          <Icon name="keyboard" /> {t('deviceKeyboard')}
        </button>
      </div>
      <div className="kb-input" data-scan-group>
        {device ? (
          <input className="input input-big" style={{ flex: 1 }} value={text} onChange={(e) => setText(e.target.value)} aria-label={t('typeHere')} autoFocus
            onKeyDown={(e) => e.key === 'Enter' && add()} />
        ) : (
          <div className="typed" aria-live="polite" aria-label={t('typeHere')}>
            {text}<span style={{ textDecoration: 'underline' }}>{pinyinBuf}</span><span className="cursor-mark" style={{ display: 'inline-block', height: '1.2em' }} />
          </div>
        )}
        <button className="btn btn-primary" onClick={add} disabled={!full} data-scan-item><Icon name="plus" /> {t('addToMessage')}</button>
        <button className="btn" onClick={() => void st.speakTokens(tokensFromText(), { record: true })} disabled={!full} data-scan-item>
          <Icon name="speak" /> {t('speakNow')}
        </button>
      </div>
      <div className="kb-candidates" data-scan-group aria-label={zhMode ? t('characters') : t('wordCompletions')}>
        {completions.map((c) => (
          <button key={c.label} className="suggest-chip" onClick={() => complete(c)} data-scan-item lang={zhMode ? 'zh-Hans' : 'en'}>{c.label}</button>
        ))}
      </div>
      {!device && (
        <div className="kb-keys" role="group" aria-label={t('keyboardTitle')}>
          {rows.flatMap((row, r) =>
            [...row].map((ch) => (
              <button key={`${r}-${ch}`} className="kb-key" data-scan-item onClick={() => type(ch)} aria-label={ch}>
                {shift && !numbers ? ch.toUpperCase() : ch}
              </button>
            )),
          )}
          <button className="kb-key wide" aria-pressed={shift} onClick={() => setShift(!shift)} data-scan-item aria-label={t('shift')}>⇧</button>
          <button className="kb-key wide" onClick={() => setNumbers(!numbers)} data-scan-item>{numbers ? 'ABC' : '123'}</button>
          <button className="kb-key space" onClick={() => type(' ')} data-scan-item>{t('space')}</button>
          <button className="kb-key wide" onClick={backspace} data-scan-item aria-label={t('backspace')}><Icon name="backspace" /></button>
        </div>
      )}
    </section>
  );
}
