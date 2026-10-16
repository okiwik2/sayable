// The message being built, the Speak button and the editing tools around it.
import { useEffect, useRef, useState } from 'react';
import { useStore, useT } from '../state/store';
import { formatMessage } from '../domain/format';
import { formsFor, FORM_LABELS } from '../domain/inflect';
import type { Token } from '../domain/types';
import { Icon } from './Icon';
import { SymbolImage } from './Tile';
import { Dialog } from './common';
import { speech } from '../services/speech';

function Chip({ token, index, selected, isNew }: { token: Token; index: number; selected: boolean; isNew: boolean }) {
  const selectToken = useStore((s) => s.selectToken);
  const item = useStore((s) => (token.itemId ? s.vocab.items.get(token.itemId) : undefined));
  const showSym = useStore((s) => s.settings.tileStyle !== 'text');
  const mixed = useStore((s) => s.settings.commLangs === 'both');
  const traditional = useStore((s) => s.settings.traditional);
  return (
    <button
      type="button"
      className={`chip ${isNew ? 'is-new' : ''}`}
      aria-pressed={selected}
      data-scan-item
      onClick={() => selectToken(selected ? null : index)}
      lang={token.lang === 'zh' ? (traditional ? 'zh-Hant' : 'zh-Hans') : 'en'}
    >
      {showSym && item?.symbol && token.kind !== 'phrase' && <SymbolImage item={item} />}
      <span>{token.text}</span>
      {mixed && <span className="chip-lang" aria-hidden="true">{token.lang === 'en' ? 'EN' : '中'}</span>}
    </button>
  );
}

function TokenTools() {
  const t = useT();
  const st = useStore();
  const i = st.selectedToken;
  if (i === null) return null;
  const token = st.message.tokens[i];
  if (!token) return null;
  const item = token.itemId ? st.vocab.items.get(token.itemId) : undefined;
  const forms = item && token.lang === 'en' ? formsFor(item) : [];
  const last = st.message.tokens.length - 1;
  return (
    <div className="token-tools" role="toolbar" aria-label={`“${token.text}”`} data-scan-group>
      <span className="label">“{token.text}”</span>
      <button className="btn btn-small" disabled={i === 0} onClick={() => st.moveToken(i, i - 1)} data-scan-item>
        <Icon name="left" size={18} /> {t('moveLeft')}
      </button>
      <button className="btn btn-small" disabled={i === last} onClick={() => st.moveToken(i, i + 1)} data-scan-item>
        {t('moveRight')} <Icon name="right" size={18} />
      </button>
      <button className="btn btn-small" onClick={() => st.setCursor(i)} data-scan-item>{t('insertBefore')}</button>
      <button className="btn btn-small" onClick={() => st.startReplace(i)} data-scan-item>{t('replace')}</button>
      {forms.length > 0 && (
        <>
          {token.form && (
            <button className="btn btn-small" onClick={() => st.changeForm(i, undefined)} data-scan-item>{item!.forms.en!.text}</button>
          )}
          {forms.filter((f) => f.form !== token.form).map((f) => (
            <button key={f.form} className="btn btn-small" onClick={() => st.changeForm(i, f.form)} title={FORM_LABELS[f.form]} data-scan-item>
              {f.text}
            </button>
          ))}
        </>
      )}
      <button className="btn btn-small" onClick={() => st.sayWord(token.say ?? token.text, token.lang)} data-scan-item>
        <Icon name="speak" size={18} /> {t('hear')}
      </button>
      <button className="btn btn-small btn-danger" onClick={() => st.removeToken(i)} data-scan-item>
        <Icon name="trash" size={18} /> {t('remove')}
      </button>
      <button className="btn btn-small" onClick={() => st.selectToken(null)} data-scan-item>{t('done')}</button>
    </div>
  );
}

export function MessageTokens({ large }: { large?: boolean }) {
  const t = useT();
  const message = useStore((s) => s.message);
  const selected = useStore((s) => s.selectedToken);
  const ref = useRef<HTMLDivElement>(null);
  const prevLen = useRef(message.tokens.length);
  const newest = message.tokens.length > prevLen.current ? message.tokens[(message.cursor ?? message.tokens.length) - 1]?.id : undefined;
  useEffect(() => {
    // Keep the newest word in view.
    if (message.tokens.length > prevLen.current && message.cursor === null && ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight;
    }
    prevLen.current = message.tokens.length;
  }, [message]);
  return (
    <div className="message-tokens" ref={ref} style={large ? { maxHeight: 'none' } : undefined}>
      {message.tokens.length === 0 && <span className="message-placeholder">{t('messageEmpty')}</span>}
      {message.tokens.map((tok, i) => (
        <span key={tok.id} style={{ display: 'contents' }}>
          {message.cursor === i && <span className="cursor-mark" aria-hidden="true" />}
          <Chip token={tok} index={i} selected={selected === i} isNew={tok.id === newest} />
        </span>
      ))}
    </div>
  );
}

export function MessageBar() {
  const t = useT();
  const st = useStore();
  const { message, speechStatus, settings } = st;
  const speaking = speechStatus !== 'idle';
  const text = formatMessage(message.tokens, settings).text;
  const cursorWord = message.cursor !== null ? message.tokens[message.cursor]?.text : undefined;
  const replacing = st.replaceIndex !== null ? message.tokens[st.replaceIndex]?.text : undefined;

  return (
    <section className="message-area" aria-label={t('message')} data-tour="message">
      <div className="message-box" data-scan-group>
        <MessageTokens />
        <button className="btn btn-quiet btn-small expand-btn" onClick={() => useStore.setState({ expandedMessage: true })} aria-label={t('expand')} title={t('expand')}>
          <Icon name="expand" size={20} />
        </button>
      </div>

      <div className="message-tools" data-tour="tools" data-scan-group role="toolbar" aria-label={t('edit')}>
        <button className="tool" onClick={st.deleteLast} disabled={!message.tokens.length} data-scan-item>
          <Icon name="backspace" /> <span className="tool-label">{t('deleteWord')}</span>
        </button>
        <button className="tool" onClick={st.undo} disabled={!st.undoStack.past.length} data-scan-item>
          <Icon name="undo" /> <span className="tool-label">{t('undo')}</span>
        </button>
        <button className="tool tool-danger" onClick={() => void st.clearMessage()} disabled={!message.tokens.length} data-scan-item>
          <Icon name="clear" /> <span className="tool-label">{t('clear')}</span>
        </button>
        <button className="tool" onClick={() => void st.saveMessage()} disabled={!message.tokens.length} data-scan-item>
          <Icon name="save" /> <span className="tool-label">{t('save')}</span>
        </button>
        <button className="tool" onClick={() => useStore.setState({ showOpen: true })} disabled={!message.tokens.length} data-scan-item>
          <Icon name="show" /> <span className="tool-label">{t('show')}</span>
        </button>
        <button className="tool" onClick={() => void st.speakMessage({ preview: true })} disabled={!message.tokens.length || speaking} data-scan-item>
          <Icon name="quiet" /> <span className="tool-label">{t('previewQuiet')}</span>
        </button>
      </div>

      <div className="speak-col" data-scan-group>
        {speaking ? (
          <button className="speak-btn is-stop" onClick={st.stopSpeech} data-scan-item aria-label={t('stopSpeaking')} data-tour="speak">
            <Icon name="stop" size={30} filled />
            {t('stop')}
          </button>
        ) : (
          <button className="speak-btn" onClick={() => void st.speakMessage()} disabled={!message.tokens.length} data-scan-item
            data-tour="speak" aria-label={message.tokens.length ? `${t('speak')}: ${text}` : t('speak')}>
            <Icon name="speak" size={30} />
            {t('speak')}
          </button>
        )}
        {speaking ? (
          <button className="btn btn-small speak-sub" data-scan-item
            onClick={() => (speechStatus === 'paused' ? speech.resume() : speech.pause())}>
            <Icon name={speechStatus === 'paused' ? 'play' : 'pause'} size={18} /> {speechStatus === 'paused' ? t('resume') : t('pause')}
          </button>
        ) : (
          <button className="btn btn-small speak-sub" onClick={st.repeatLast} disabled={!st.lastSpoken} data-scan-item>
            <Icon name="repeat" size={18} /> {t('sayAgain')}
          </button>
        )}
      </div>

      {replacing && (
        <div className="replace-banner" role="status">
          {t('replacing', { word: replacing })}
          <button className="btn btn-small" onClick={() => useStore.setState({ replaceIndex: null })}>{t('cancel')}</button>
        </div>
      )}
      {cursorWord && !replacing && (
        <div className="replace-banner" role="status">
          {t('addingBefore', { word: cursorWord })}
          <button className="btn btn-small" onClick={() => st.setCursor(null)}>{t('backToEnd')}</button>
        </div>
      )}
      <TokenTools />
      <p className="sr-only" aria-live="polite">{message.tokens.length ? t('messageHas', { text }) : ''}</p>
    </section>
  );
}

/** A large, easy-to-read editor for long messages. */
export function ExpandedMessage() {
  const t = useT();
  const open = useStore((s) => s.expandedMessage);
  const st = useStore();
  const [, force] = useState(0);
  if (!open) return null;
  const close = () => useStore.setState({ expandedMessage: false });
  return (
    <Dialog
      title={t('editMessage')}
      size="wide"
      onClose={close}
      footer={
        <>
          <button className="btn" onClick={st.undo} disabled={!st.undoStack.past.length}><Icon name="undo" /> {t('undo')}</button>
          <button className="btn" onClick={st.deleteLast}><Icon name="backspace" /> {t('deleteWord')}</button>
          <button className="btn btn-primary" onClick={() => { void st.speakMessage(); force((n) => n + 1); }}><Icon name="speak" /> {t('speak')}</button>
          <button className="btn" onClick={close}>{t('done')}</button>
        </>
      }
    >
      <div style={{ fontSize: '1.2em' }}>
        <MessageTokens large />
      </div>
      <TokenTools />
    </Dialog>
  );
}
