// "Where does it hurt?": tap the body (or the list of body parts) and a 0–10 pain scale, then
// speak the sentence or put it in the message.
import { useState, type ReactElement } from 'react';
import { useStore, useT } from '../state/store';
import { primaryLang } from '../domain/settings';
import { typedToken } from '../domain/sentence';
import { BODY_PARTS, painMessage, painWord, type BodyPartId } from '../domain/safety';
import { Dialog } from './common';
import { Icon } from './Icon';

/** Tap areas on the body outline. Every part is also in the list of buttons, which is what screen readers use. */
const SHAPES: { part: BodyPartId; el: ReactElement }[] = [
  { part: 'head', el: <circle cx="60" cy="28" r="20" /> },
  { part: 'throat', el: <rect x="51" y="48" width="18" height="12" rx="3" /> },
  { part: 'chest', el: <rect x="37" y="60" width="46" height="36" rx="8" /> },
  { part: 'stomach', el: <rect x="39" y="96" width="42" height="36" rx="8" /> },
  { part: 'arm', el: <rect x="17" y="62" width="18" height="70" rx="8" /> },
  { part: 'arm', el: <rect x="85" y="62" width="18" height="70" rx="8" /> },
  { part: 'hand', el: <circle cx="26" cy="143" r="10" /> },
  { part: 'hand', el: <circle cx="94" cy="143" r="10" /> },
  { part: 'leg', el: <rect x="41" y="134" width="17" height="76" rx="7" /> },
  { part: 'leg', el: <rect x="62" y="134" width="17" height="76" rx="7" /> },
  { part: 'knee', el: <circle cx="49.5" cy="174" r="8" /> },
  { part: 'knee', el: <circle cx="70.5" cy="174" r="8" /> },
  { part: 'foot', el: <ellipse cx="47" cy="220" rx="11" ry="7" /> },
  { part: 'foot', el: <ellipse cx="73" cy="220" rx="11" ry="7" /> },
];

const FACES = ['😀', '🙂', '🙂', '😐', '😐', '😕', '😟', '😣', '😖', '😫', '😭'];

export function PainScale({ onClose }: { onClose: () => void }) {
  const t = useT();
  const st = useStore();
  const lang = primaryLang(st.settings);
  const [parts, setParts] = useState<BodyPartId[]>([]);
  const [level, setLevel] = useState<number | null>(null);
  const toggle = (p: BodyPartId) => setParts((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));
  const sentence = painMessage(parts, level, lang);
  const ready = parts.length > 0 || level !== null;

  return (
    <Dialog title={t('whereHurts')} size="wide" onClose={onClose}
      footer={<>
        <button className="btn" onClick={() => { setParts([]); setLevel(null); }} disabled={!ready}><Icon name="clear" /> {t('clear')}</button>
        <button className="btn" disabled={!ready} onClick={() => { st.addTokens([typedToken(sentence, lang)]); onClose(); }}>
          <Icon name="plus" /> {t('detailAdd')}
        </button>
        <button className="btn btn-primary" disabled={!ready} onClick={() => st.sayWord(sentence, lang)}><Icon name="speak" /> {t('speak')}</button>
      </>}>
      <p className="pain-sentence" aria-live="polite">{ready ? sentence : t('painPrompt')}</p>
      <div className="pain-layout">
        <svg className="body-map" viewBox="0 0 120 232" aria-hidden="true">
          {SHAPES.map(({ part, el }, i) => (
            <g key={i} className={parts.includes(part) ? 'is-on' : ''} onClick={() => toggle(part)}>{el}</g>
          ))}
        </svg>
        <div className="pain-parts" role="group" aria-label={t('whereHurts')}>
          {BODY_PARTS.map((p) => (
            <button key={p.id} className="btn" aria-pressed={parts.includes(p.id)} onClick={() => toggle(p.id)}>
              {lang === 'zh' ? p.zh : p.en.charAt(0).toUpperCase() + p.en.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <h3 className="pain-scale-title">{t('howMuch')}</h3>
      <div className="pain-scale" role="radiogroup" aria-label={t('howMuch')}>
        {FACES.map((face, n) => (
          <button key={n} type="button" role="radio" aria-checked={level === n} className="pain-step" data-level={n} onClick={() => setLevel(n)}
            aria-label={`${n}, ${painWord(n, lang)}`}>
            <span className="face" aria-hidden="true">{face}</span>
            <strong>{n}</strong>
          </button>
        ))}
      </div>
      <p className="pain-words muted">{level !== null ? painWord(level, lang) : ' '}</p>
    </Dialog>
  );
}
