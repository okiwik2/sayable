// Small shared building blocks: dialog, toggles, choices, sliders, confirm and toasts.
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { usePress } from './hooks';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import { useStore, useT } from '../state/store';

let openDialogs = 0;

/** While any dialog is open, the screen behind it cannot be focused or clicked. */
function useInertBackground() {
  useEffect(() => {
    openDialogs++;
    document.querySelector('.app')?.setAttribute('inert', '');
    return () => {
      openDialogs--;
      if (!openDialogs) document.querySelector('.app')?.removeAttribute('inert');
    };
  }, []);
}

/** Accessible modal dialog: focus moves in, Tab stays inside, Escape closes, focus returns after. */
export function Dialog({
  title, onClose, children, footer, size, labelledBy,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'small' | 'wide';
  labelledBy?: string;
}) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useInertBackground();
  // Focus moves into the window once, when it opens. (Re-running this on every render made focus
  // jump back to the first button whenever anything else in the app updated.)
  const closeRef = useRef(onClose);
  useLayoutEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const first = el?.querySelector<HTMLElement>('[data-autofocus]') ?? el?.querySelector<HTMLElement>('button, [href], input, select, textarea');
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
      }
      if (e.key === 'Tab' && el) {
        const items = [...el.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input:not(:disabled), select, textarea, [tabindex]:not([tabindex="-1"])')];
        if (!items.length) return;
        const firstItem = items[0]!;
        const lastItem = items[items.length - 1]!;
        if (e.shiftKey && document.activeElement === firstItem) {
          e.preventDefault();
          lastItem.focus();
        } else if (!e.shiftKey && document.activeElement === lastItem) {
          e.preventDefault();
          firstItem.focus();
        }
      }
    };
    el?.addEventListener('keydown', onKey);
    return () => {
      el?.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, []);
  return createPortal(
    <div className="overlay" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className={`dialog ${size ?? ''}`} role="dialog" aria-modal="true" aria-labelledby={labelledBy ?? id}>
        <div className="dialog-head">
          <h2 id={id}>{title}</h2>
          <button className="btn btn-quiet" onClick={onClose} aria-label={t('close')}>
            <Icon name="clear" />
          </button>
        </div>
        <div className="dialog-body">{children}</div>
        {footer && <div className="dialog-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/** A button that only acts after being held, so it isn't pressed by accident. Keyboard and switch users press it normally. */
export function HoldButton({ holdMs, onHold, className = 'btn', hint, label, children }: { holdMs: number; onHold: () => void; className?: string; hint: string; label?: string; children: ReactNode }) {
  const startedAt = useRef(0);
  const { pressed, handlers } = usePress({ activation: holdMs > 0 ? 'hold' : 'press', holdMs, onActivate: onHold });
  return (
    <button type="button" className={`${className} hold-btn ${pressed ? 'is-holding' : ''}`} style={{ '--hold-ms': `${holdMs}ms` } as React.CSSProperties}
      aria-label={label} {...handlers}
      onPointerDown={(e) => { startedAt.current = Date.now(); handlers.onPointerDown(e); }}
      onPointerUp={() => {
        // Let go too early: say how it works.
        if (holdMs > 0 && pressed && Date.now() - startedAt.current < holdMs) useStore.getState().toast({ text: hint, ms: 2500 });
        handlers.onPointerUp();
      }}>
      <span className="hold-fill" aria-hidden="true" />
      {children}
    </button>
  );
}

export function Toggle({ label, help, checked, onChange, disabled }: { label: ReactNode; help?: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} className="toggle" onClick={() => onChange(!checked)} disabled={disabled}>
      <span className="text">
        {label}
        {help && <small>{help}</small>}
      </span>
      <span className="switch" aria-hidden="true" />
    </button>
  );
}

export function Choices<T extends string | number>({
  label, value, options, onChange, help,
}: {
  label: ReactNode;
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  help?: ReactNode;
}) {
  const id = useId();
  return (
    <div className="field" role="radiogroup" aria-labelledby={id}>
      <span className="label" id={id}>{label}</span>
      {help && <span className="help">{help}</span>}
      <div className="choice-group">
        {options.map((o) => (
          <button type="button" key={String(o.value)} role="radio" aria-checked={o.value === value} className="choice" onClick={() => onChange(o.value)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Range({
  label, value, min, max, step, onChange, display, help,
}: {
  label: ReactNode;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  display?: (v: number) => string;
  help?: ReactNode;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {help && <span className="help">{help}</span>}
      <div className="range-row">
        <button type="button" className="btn btn-small" aria-label={`${label} −`} onClick={() => onChange(Math.max(min, +(value - step).toFixed(3)))}>−</button>
        <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
        <button type="button" className="btn btn-small" aria-label={`${label} +`} onClick={() => onChange(Math.min(max, +(value + step).toFixed(3)))}>+</button>
        <output htmlFor={id}>{display ? display(value) : value}</output>
      </div>
    </div>
  );
}

export function TextField({
  label, value, onChange, help, type = 'text', multiline, lang, placeholder, inputMode, autoFocus,
}: {
  label: ReactNode;
  value: string;
  onChange: (v: string) => void;
  help?: ReactNode;
  type?: string;
  multiline?: boolean;
  lang?: string;
  placeholder?: string;
  inputMode?: 'text' | 'numeric' | 'tel' | 'search';
  autoFocus?: boolean;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {help && <span className="help" id={`${id}-help`}>{help}</span>}
      {multiline ? (
        <textarea id={id} className="input" value={value} lang={lang} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} aria-describedby={help ? `${id}-help` : undefined} />
      ) : (
        <input id={id} className="input" type={type} value={value} lang={lang} placeholder={placeholder} inputMode={inputMode}
          data-autofocus={autoFocus || undefined}
          onChange={(e) => onChange(e.target.value)} aria-describedby={help ? `${id}-help` : undefined} />
      )}
    </div>
  );
}

/** Renders the pending confirmation request from the store. */
export function ConfirmHost() {
  const req = useStore((s) => s.confirmReq);
  const t = useT();
  const [typed, setTyped] = useState('');
  useEffect(() => setTyped(''), [req]);
  if (!req) return null;
  const blocked = !!req.typeToConfirm && typed.trim().toUpperCase() !== req.typeToConfirm;
  return (
    <Dialog
      title={req.text}
      size="small"
      onClose={() => req.resolve(null)}
      footer={
        req.options ? (
          <>
            <button className="btn" onClick={() => req.resolve(null)}>{t('cancel')}</button>
            {req.options.map((o) => (
              <button key={o.value} className={`btn ${o.danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => req.resolve(o.value)}>{o.label}</button>
            ))}
          </>
        ) : (
          <>
            <button className="btn" onClick={() => req.resolve(null)} data-autofocus>{t('cancel')}</button>
            <button className={`btn ${req.danger ? 'btn-danger-solid' : 'btn-primary'}`} disabled={blocked} onClick={() => req.resolve('ok')}>
              {req.confirmLabel ?? t('ok')}
            </button>
          </>
        )
      }
    >
      {req.detail && <p>{req.detail}</p>}
      {req.typeToConfirm && <TextField label={req.typeToConfirm} value={typed} onChange={setTyped} />}
    </Dialog>
  );
}

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast tone-${t.tone ?? 'info'}`}>
          <span className="grow">{t.text}</span>
          {t.actions?.map((a) => (
            <button key={a.label} className="btn btn-small" onClick={() => { a.run(); dismiss(t.id); }}>{a.label}</button>
          ))}
        </div>
      ))}
    </div>
  );
}
