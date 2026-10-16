// The sentence builder: pure functions over the message state (a list of tokens plus an insertion point).
// Every change returns a new state so undo is just "go back to the previous state".
import type { Lang, MessageState, Token, VocabItem, EnglishFormKey } from './types';
import { inflect } from './inflect';

let counter = 0;
export const newTokenId = () => `t${Date.now().toString(36)}${(counter++).toString(36)}`;

export const EMPTY_MESSAGE: MessageState = { tokens: [], cursor: null };

/** Text of an item in a language, using Traditional characters when asked. */
export function itemText(item: VocabItem, lang: Lang, traditional = false): string | undefined {
  if (lang === 'en') return item.forms.en?.text;
  const zh = item.forms.zh;
  if (!zh) return undefined;
  return traditional ? zh.hant : zh.hans;
}

/** Make a token for a vocabulary item in a language. Returns null if the item has no form in that language. */
export function tokenFor(item: VocabItem, lang: Lang, opts: { traditional?: boolean; form?: EnglishFormKey } = {}): Token | null {
  let text = itemText(item, lang, opts.traditional);
  if (!text) return null;
  let say = lang === 'en' ? item.forms.en?.say : item.forms.zh?.say;
  if (opts.form && lang === 'en') {
    text = inflect(text, opts.form, item.grammar?.irregular);
    say = undefined;
  }
  return {
    id: newTokenId(),
    itemId: item.id,
    text,
    lang,
    say,
    pos: item.pos,
    form: opts.form,
    kind: item.kind === 'phrase' ? 'phrase' : 'word',
  };
}

export function typedToken(text: string, lang: Lang): Token {
  return { id: newTokenId(), text, lang, kind: 'typed' };
}

/** Insert tokens at the cursor (or the end). The cursor moves along so the next word follows. */
export function insert(state: MessageState, tokens: Token[]): MessageState {
  if (!tokens.length) return state;
  const at = state.cursor ?? state.tokens.length;
  const next = [...state.tokens.slice(0, at), ...tokens, ...state.tokens.slice(at)];
  return { tokens: next, cursor: state.cursor === null ? null : at + tokens.length };
}

export function removeAt(state: MessageState, index: number): MessageState {
  if (index < 0 || index >= state.tokens.length) return state;
  const tokens = state.tokens.filter((_, i) => i !== index);
  let cursor = state.cursor;
  if (cursor !== null && index < cursor) cursor -= 1;
  if (cursor !== null && cursor >= tokens.length) cursor = null;
  return { tokens, cursor };
}

/** Delete the word before the cursor (like a backspace key). */
export function deleteLast(state: MessageState): MessageState {
  const at = state.cursor ?? state.tokens.length;
  if (at === 0) return state;
  return removeAt(state, at - 1);
}

export function clear(): MessageState {
  return EMPTY_MESSAGE;
}

export function move(state: MessageState, from: number, to: number): MessageState {
  if (from === to || from < 0 || to < 0 || from >= state.tokens.length || to >= state.tokens.length) return state;
  const tokens = [...state.tokens];
  const [tok] = tokens.splice(from, 1);
  tokens.splice(to, 0, tok!);
  return { tokens, cursor: state.cursor };
}

export function replaceAt(state: MessageState, index: number, token: Token): MessageState {
  if (index < 0 || index >= state.tokens.length) return state;
  const tokens = [...state.tokens];
  tokens[index] = token;
  return { tokens, cursor: state.cursor };
}

/** Put the insertion point before token `index`; null or the end means "add to the end". */
export function setCursor(state: MessageState, index: number | null): MessageState {
  if (index === null || index >= state.tokens.length) return { ...state, cursor: null };
  return { ...state, cursor: Math.max(0, index) };
}

/** Replace the whole message, e.g. with a saved phrase or an accepted grammar suggestion. */
export function replaceAll(tokens: Token[]): MessageState {
  return { tokens: tokens.map((t) => ({ ...t, id: newTokenId() })), cursor: null };
}

export function languagesIn(state: MessageState): Lang[] {
  return [...new Set(state.tokens.map((t) => t.lang))];
}

/** Undo history: a bounded stack of earlier states. */
export interface UndoStack {
  past: MessageState[];
}

export const UNDO_LIMIT = 50;

export function pushUndo(stack: UndoStack, previous: MessageState): UndoStack {
  return { past: [...stack.past, previous].slice(-UNDO_LIMIT) };
}

export function popUndo(stack: UndoStack): { stack: UndoStack; state: MessageState | null } {
  if (!stack.past.length) return { stack, state: null };
  const past = stack.past.slice(0, -1);
  return { stack: { past }, state: stack.past.at(-1)! };
}
