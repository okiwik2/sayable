// Central app state. UI components read from here and call these actions; the actions
// update state immediately (so the screen never waits) and save to the device in the background.
import { create } from 'zustand';
import { dataset, loadSignPack } from '../data/dataset';
import type {
  Board, Category, EnglishFormKey, HistoryEntry, Lang, MessageState, SavedMessage, SignPack, SignResource, Token, VocabItem,
} from '../domain/types';
import { defaultSettings, primaryLang, type Settings } from '../domain/settings';
import * as S from '../domain/sentence';
import { formatMessage, type Segment } from '../domain/format';
import { buildVocabulary, type ItemOverride, type Vocabulary, type CategoryPrefs } from '../domain/vocabulary';
import { buildIndex, type SearchIndex } from '../domain/search';
import { learn } from '../domain/predict';
import { speech, type SpeechStatus } from '../services/speech';
import * as repo from '../services/repo';
import type { ProfileDataRow, ProfileRow } from '../services/db';
import { en, zh, format, type StringKey } from '../i18n/strings';
import { vibrate } from '../services/haptics';

export type View =
  | { screen: 'board'; boardId?: string | null }
  | { screen: 'topics'; path: string[] }
  | { screen: 'search' }
  | { screen: 'quick' }
  | { screen: 'favourites' }
  | { screen: 'saved' }
  | { screen: 'keyboard' }
  | { screen: 'signs' }
  | { screen: 'boards' }
  | { screen: 'safety' }
  | { screen: 'settings'; section?: string };

export interface Toast {
  id: string;
  text: string;
  tone?: 'info' | 'warn' | 'error' | 'success';
  actions?: { label: string; run: () => void }[];
  ms?: number;
}

export interface ConfirmRequest {
  text: string;
  detail?: string;
  confirmLabel?: string;
  danger?: boolean;
  /** Ask the user to type this before confirming (for very destructive actions). */
  typeToConfirm?: string;
  options?: { label: string; value: string; danger?: boolean }[];
  resolve: (value: string | null) => void;
}

export interface EditorRequest {
  itemId?: string;
  /** For new words */
  categoryId?: string;
  initialText?: string;
  /** Start a new entry as this kind of word (e.g. 'phrase'). */
  pos?: VocabItem['pos'];
  /** Called with the saved word (e.g. to place it on a board). */
  onSaved?: (item: VocabItem) => void;
}

interface State {
  ready: boolean;
  loadError: string | null;
  profiles: ProfileRow[];
  profileId: string;
  settings: Settings;
  overrides: ItemOverride[];
  customItems: VocabItem[];
  customCategories: Category[];
  userBoards: Board[];
  data: ProfileDataRow;
  saved: SavedMessage[];
  history: HistoryEntry[];
  customSigns: SignResource[];
  vocab: Vocabulary;
  vocabVersion: number;

  message: MessageState;
  undoStack: S.UndoStack;
  selectedToken: number | null;
  replaceIndex: number | null;
  lastSpoken: { text: string; segments: Segment[] } | null;
  speechStatus: SpeechStatus;

  view: View;
  editMode: boolean;
  moveFrom: number | null;
  helperUnlocked: boolean;
  detailItemId: string | null;
  editor: EditorRequest | null;
  showOpen: boolean;
  expandedMessage: boolean;
  tutorialStep: number | null;
  toasts: Toast[];
  confirmReq: ConfirmRequest | null;
  signPack: SignPack | null;
  online: boolean;
}

interface Actions {
  init(): Promise<void>;
  t(key: StringKey, vars?: Record<string, string | number>): string;
  toast(t: Omit<Toast, 'id'>): void;
  dismissToast(id: string): void;
  confirm(req: Omit<ConfirmRequest, 'resolve'>): Promise<string | null>;
  go(view: View): void;

  // Message
  tapItem(item: VocabItem, opts?: { lang?: Lang; form?: EnglishFormKey; fromTopic?: boolean }): void;
  addTokens(tokens: Token[]): void;
  removeToken(index: number): void;
  deleteLast(): void;
  clearMessage(): Promise<void>;
  moveToken(from: number, to: number): void;
  setCursor(index: number | null): void;
  selectToken(index: number | null): void;
  startReplace(index: number): void;
  changeForm(index: number, form: EnglishFormKey | undefined): void;
  replaceMessage(tokens: Token[]): void;
  undo(): void;

  // Speech
  speakMessage(opts?: { preview?: boolean }): Promise<void>;
  speakTokens(tokens: Token[], opts?: { preview?: boolean; record?: boolean }): Promise<void>;
  speakItemNow(item: VocabItem): Promise<void>;
  sayWord(text: string, lang: Lang): void;
  repeatLast(): void;
  stopSpeech(): void;

  // Saved and history
  saveMessage(): Promise<void>;
  deleteSaved(id: string): Promise<void>;
  toggleSavedFavourite(id: string): Promise<void>;
  useSaved(msg: { tokens: Token[] }): void;
  clearHistory(): Promise<void>;

  // Personalisation
  updateSettings(patch: Partial<Settings>): void;
  setOverride(itemId: string, patch: Partial<ItemOverride>, summary?: string): Promise<void>;
  resetOverride(itemId: string): Promise<void>;
  toggleFavourite(itemId: string): void;
  saveCustomItem(item: VocabItem, summary: string): Promise<void>;
  deleteCustomItem(itemId: string): Promise<void>;
  saveBoard(board: Board, summary: string): Promise<void>;
  deleteBoard(boardId: string): Promise<void>;
  updateCategoryPrefs(patch: Partial<CategoryPrefs>, summary?: string): Promise<void>;
  saveQuickGroups(groups: NonNullable<ProfileDataRow['quickGroups']>): Promise<void>;
  saveCustomSign(sign: SignResource): Promise<void>;
  deleteCustomSign(id: string): Promise<void>;
  noteSignViewed(itemId: string): void;
  clearLearned(): Promise<void>;
  logChange(summary: string): Promise<void>;

  // Profiles
  switchProfile(id: string): Promise<void>;
  addProfile(name: string): Promise<void>;
  renameProfile(id: string, name: string): Promise<void>;
  deleteProfile(id: string): Promise<void>;
  reloadProfile(): Promise<void>;

  // Signs and search
  loadSigns(): Promise<SignPack | null>;
  getSearchIndex(): SearchIndex;
}

export type Store = State & Actions;

let searchCache: { version: number; index: SearchIndex } | null = null;
let sessionTimer: ReturnType<typeof setTimeout> | null = null;
let dataTimer: ReturnType<typeof setTimeout> | null = null;
let lastTap = { id: '', at: 0 };

const emptyVocab = buildVocabulary(dataset, [], []);

export const useStore = create<Store>()((set, get) => {
  /** Change the message, remembering the old one for Undo, and save it in the background. */
  const commit = (next: MessageState, opts: { undoable?: boolean } = {}) => {
    const prev = get().message;
    if (next === prev) return;
    set({
      message: next,
      undoStack: opts.undoable === false ? get().undoStack : S.pushUndo(get().undoStack, prev),
      selectedToken: null,
      replaceIndex: null,
    });
    if (sessionTimer) clearTimeout(sessionTimer);
    sessionTimer = setTimeout(() => {
      const { profileId, message } = get();
      if (profileId) repo.saveSession(profileId, message.tokens, message.cursor).catch(() => {});
    }, 300);
  };

  const saveData = () => {
    if (dataTimer) clearTimeout(dataTimer);
    dataTimer = setTimeout(() => {
      repo.putProfileData(get().data).catch(() => {});
    }, 800);
  };

  const rebuildVocab = () => {
    const { overrides, customItems, customCategories, vocabVersion } = get();
    set({ vocab: buildVocabulary(dataset, customItems, overrides, customCategories), vocabVersion: vocabVersion + 1 });
  };

  const persistError = (e: unknown) => {
    console.error(e);
    get().toast({ text: get().t('error'), tone: 'error' });
  };

  const applyBundle = (b: repo.ProfileBundle, profiles: ProfileRow[]) => {
    const restore = b.settings.restoreUnfinished && b.session?.tokens.length;
    set({
      ready: true,
      profiles,
      profileId: b.profile.id,
      settings: b.settings,
      overrides: b.overrides,
      customItems: b.customItems,
      customCategories: b.customCategories,
      userBoards: b.boards,
      data: b.data,
      saved: b.saved,
      history: b.history,
      customSigns: b.customSigns,
      message: restore ? { tokens: b.session!.tokens, cursor: b.session!.cursor } : S.EMPTY_MESSAGE,
      undoStack: { past: [] },
      view: { screen: 'board' },
      editMode: false,
      helperUnlocked: false,
    });
    rebuildVocab();
    if (restore) get().toast({ text: get().t('restoredMessage'), tone: 'info', ms: 3500 });
  };

  const recordUsage = (itemId: string) => {
    const data = get().data;
    const u = data.usage[itemId];
    set({ data: { ...data, usage: { ...data.usage, [itemId]: { count: (u?.count ?? 0) + 1, last: Date.now() } } } });
    saveData();
  };

  return {
    ready: false,
    loadError: null,
    profiles: [],
    profileId: '',
    settings: defaultSettings(),
    overrides: [],
    customItems: [],
    customCategories: [],
    userBoards: [],
    data: repo.emptyProfileData(''),
    saved: [],
    history: [],
    customSigns: [],
    vocab: emptyVocab,
    vocabVersion: 0,
    message: S.EMPTY_MESSAGE,
    undoStack: { past: [] },
    selectedToken: null,
    replaceIndex: null,
    lastSpoken: null,
    speechStatus: 'idle',
    view: { screen: 'board' },
    editMode: false,
    moveFrom: null,
    helperUnlocked: false,
    detailItemId: null,
    editor: null,
    showOpen: false,
    expandedMessage: false,
    tutorialStep: null,
    toasts: [],
    confirmReq: null,
    signPack: null,
    online: typeof navigator === 'undefined' ? true : navigator.onLine,

    async init() {
      speech.onStatus((s) => set({ speechStatus: s }));
      try {
        const profile = await repo.ensureProfile();
        const [bundle, profiles] = await Promise.all([repo.loadProfile(profile.id), repo.listProfiles()]);
        applyBundle(bundle, profiles);
        repo.requestPersistentStorage();
      } catch (e) {
        console.error(e);
        // Storage can fail (private browsing, full disk). Communication must still work.
        set({ ready: true, loadError: String(e), profileId: 'temporary', settings: defaultSettings({ onboarded: true }) });
      }
    },

    t(key, vars) {
      const table = get().settings.uiLang === 'zh' ? zh : en;
      return format(table[key] as string, vars);
    },

    toast(t) {
      const id = repo.newId('toast');
      set({ toasts: [...get().toasts.slice(-2), { ...t, id }] });
      setTimeout(() => get().dismissToast(id), t.ms ?? (t.actions ? 7000 : 3000));
    },

    dismissToast(id) {
      set({ toasts: get().toasts.filter((x) => x.id !== id) });
    },

    confirm(req) {
      return new Promise((resolve) => {
        set({
          confirmReq: {
            ...req,
            resolve: (v) => {
              set({ confirmReq: null });
              resolve(v);
            },
          },
        });
      });
    },

    go(view) {
      set({ view, detailItemId: null, moveFrom: null });
    },

    // ---------------- Message ----------------

    tapItem(item, opts = {}) {
      const st = get();
      const now = Date.now();
      // Ignore repeated taps within the user's chosen time (tremor, accidental double taps).
      if (st.settings.debounceMs && lastTap.id === item.id && now - lastTap.at < st.settings.debounceMs) return;
      lastTap = { id: item.id, at: now };
      if (st.settings.haptics) vibrate();

      const lang = opts.lang ?? primaryLang(st.settings);
      const useLang: Lang | null = item.forms[lang] ? lang : (Object.keys(item.forms)[0] as Lang | undefined) ?? null;
      if (!useLang) return;
      const token = S.tokenFor(item, useLang, { traditional: st.settings.traditional, form: opts.form });
      if (!token) return;
      recordUsage(item.id);

      if (st.replaceIndex !== null) {
        commit(S.replaceAt(st.message, st.replaceIndex, token));
      } else if (item.kind === 'phrase' && (item.quick || st.settings.phraseTilesSpeakNow)) {
        void get().speakItemNow(item);
        return;
      } else {
        commit(S.insert(st.message, [token]));
      }
      if (st.settings.speakEachWord) get().sayWord(token.say ?? token.text, token.lang);
      if (opts.fromTopic && st.settings.returnToCoreAfterTopicWord) set({ view: { screen: 'board' } });
    },

    addTokens(tokens) {
      commit(S.insert(get().message, tokens));
    },

    removeToken(index) {
      commit(S.removeAt(get().message, index));
    },

    deleteLast() {
      commit(S.deleteLast(get().message));
    },

    async clearMessage() {
      const st = get();
      if (!st.message.tokens.length) return;
      if (st.settings.confirmClear) {
        const ok = await get().confirm({ text: st.t('clearConfirm'), confirmLabel: st.t('clear'), danger: true });
        if (!ok) return;
      }
      commit(S.clear());
      get().toast({ text: get().t('cleared'), actions: [{ label: get().t('undoAction'), run: () => get().undo() }] });
    },

    moveToken(from, to) {
      commit(S.move(get().message, from, to));
      set({ selectedToken: to });
    },

    setCursor(index) {
      set({ message: S.setCursor(get().message, index), selectedToken: null });
    },

    selectToken(index) {
      set({ selectedToken: index, replaceIndex: null });
    },

    startReplace(index) {
      set({ replaceIndex: index, selectedToken: null });
    },

    changeForm(index, form) {
      const st = get();
      const tok = st.message.tokens[index];
      const item = tok?.itemId ? st.vocab.items.get(tok.itemId) : undefined;
      if (!tok || !item) return;
      const next = S.tokenFor(item, tok.lang, { traditional: st.settings.traditional, form });
      if (next) commit(S.replaceAt(st.message, index, next));
    },

    replaceMessage(tokens) {
      commit(S.replaceAll(tokens));
    },

    undo() {
      const st = get();
      const { stack, state } = S.popUndo(st.undoStack);
      if (!state) return;
      set({ message: state, undoStack: stack, selectedToken: null, replaceIndex: null });
      repo.saveSession(st.profileId, state.tokens, state.cursor).catch(() => {});
    },

    // ---------------- Speech ----------------

    async speakMessage(opts = {}) {
      await get().speakTokens(get().message.tokens, { preview: opts.preview, record: !opts.preview });
    },

    async speakTokens(tokens, opts = {}) {
      const st = get();
      if (!tokens.length) return;
      const { text, segments } = formatMessage(tokens, st.settings);
      if (!opts.preview) set({ lastSpoken: { text, segments } });
      if (opts.record) {
        if (st.settings.keepHistory && st.profileId !== 'temporary') {
          const entry: HistoryEntry = { id: repo.newId('h'), profileId: st.profileId, text, tokens, at: Date.now() };
          set({ history: [entry, ...get().history].slice(0, 300) });
          repo.addHistory(entry).catch(() => {});
        }
        if (st.settings.learnFromMe) {
          set({ data: { ...get().data, bigrams: learn(get().data.bigrams, tokens, get().vocab.items) } });
          saveData();
        }
      }
      if (!speech.supported) {
        get().toast({ text: get().t('noSpeech'), tone: 'warn', ms: 4000 });
        return;
      }
      const s = get().settings;
      const result = await speech.speak(segments, {
        voices: s.voices,
        rate: s.rate,
        pitch: s.pitch,
        volume: opts.preview ? s.previewVolume : s.volume,
        pauseBetweenMs: s.pauseBetweenLangsMs,
        pronunciations: s.pronunciations,
      });
      for (const lang of result.missingVoices) {
        get().toast({ text: get().t('voiceMissingSpoken', { lang: get().t(lang === 'en' ? 'langEn' : 'langZh') }), tone: 'warn', ms: 6000 });
      }
      if (!result.ok && !result.missingVoices.length) get().toast({ text: get().t('speechFailed'), tone: 'error', ms: 5000 });
    },

    async speakItemNow(item) {
      const st = get();
      const lang = primaryLang(st.settings);
      const useLang: Lang = item.forms[lang] ? lang : lang === 'en' ? 'zh' : 'en';
      const token = S.tokenFor(item, useLang, { traditional: st.settings.traditional });
      if (!token) return;
      recordUsage(item.id);
      const hasMessage = st.message.tokens.length > 0;
      const behaviour = st.settings.quickBehaviour;
      const speakPromise = get().speakTokens([token], { record: true });
      if (hasMessage && behaviour === 'replace') commit(S.replaceAll([token]));
      else if (behaviour === 'append') commit(S.insert(st.message, [token]));
      else if (hasMessage && behaviour === 'ask') {
        get().toast({
          text: get().t('quickAsk'),
          ms: 9000,
          actions: [
            { label: get().t('quickKeep'), run: () => {} },
            { label: get().t('quickReplace'), run: () => commit(S.replaceAll([token])) },
            { label: get().t('quickAppend'), run: () => commit(S.insert(get().message, [token])) },
          ],
        });
      }
      await speakPromise;
    },

    sayWord(text, lang) {
      const s = get().settings;
      void speech.speak([{ lang, text, speech: text }], {
        voices: s.voices, rate: s.rate, pitch: s.pitch, volume: s.volume, pronunciations: s.pronunciations,
      });
    },

    repeatLast() {
      const last = get().lastSpoken;
      if (!last) return;
      const s = get().settings;
      void speech.speak(last.segments, {
        voices: s.voices, rate: s.rate, pitch: s.pitch, volume: s.volume, pauseBetweenMs: s.pauseBetweenLangsMs, pronunciations: s.pronunciations,
      });
    },

    stopSpeech() {
      speech.stop();
    },

    // ---------------- Saved and history ----------------

    async saveMessage() {
      const st = get();
      if (!st.message.tokens.length) return;
      const { text } = formatMessage(st.message.tokens, st.settings);
      if (st.saved.some((m) => m.text === text)) {
        get().toast({ text: st.t('alreadySaved') });
        return;
      }
      const langs = S.languagesIn(st.message);
      const msg: SavedMessage = {
        id: repo.newId('m'),
        profileId: st.profileId,
        text,
        tokens: st.message.tokens,
        lang: langs.length > 1 ? 'mixed' : langs[0]!,
        createdAt: Date.now(),
        uses: 0,
      };
      set({ saved: [msg, ...st.saved] });
      get().toast({ text: st.t('messageSaved'), tone: 'success' });
      await repo.putSaved(msg).catch(persistError);
    },

    async deleteSaved(id) {
      set({ saved: get().saved.filter((m) => m.id !== id) });
      await repo.deleteSaved(id).catch(persistError);
    },

    async toggleSavedFavourite(id) {
      const saved = get().saved.map((m) => (m.id === id ? { ...m, favourite: !m.favourite } : m));
      set({ saved });
      const msg = saved.find((m) => m.id === id);
      if (msg) await repo.putSaved(msg).catch(persistError);
    },

    useSaved(msg) {
      commit(S.replaceAll(msg.tokens));
      set({ view: { screen: 'board' } });
    },

    async clearHistory() {
      set({ history: [] });
      await repo.clearHistory(get().profileId).catch(persistError);
    },

    // ---------------- Personalisation ----------------

    updateSettings(patch) {
      const settings = { ...get().settings, ...patch };
      set({ settings });
      if (get().profileId !== 'temporary') repo.saveSettings(get().profileId, settings).catch(persistError);
    },

    async setOverride(itemId, patch, summary) {
      const st = get();
      const item = st.vocab.items.get(itemId);
      if (item?.essential && patch.hidden) {
        get().toast({ text: st.t('essentialCannotHide', { word: item.forms.en?.text ?? item.forms.zh?.hans ?? '' }), tone: 'warn' });
        return;
      }
      const existing = st.overrides.find((o) => o.itemId === itemId);
      const next: ItemOverride = { ...(existing ?? { itemId }), ...patch };
      set({ overrides: [...st.overrides.filter((o) => o.itemId !== itemId), next] });
      rebuildVocab();
      await repo.putOverride(st.profileId, next).catch(persistError);
      if (summary) await get().logChange(summary);
    },

    async resetOverride(itemId) {
      // Back to the built-in word, keeping favourites and chosen signs.
      const item = get().vocab.items.get(itemId);
      await get().setOverride(
        itemId,
        { label: undefined, say: undefined, imageId: undefined, symbol: undefined, hidden: undefined, keywords: undefined, notes: undefined },
        `Undid changes to “${item?.forms.en?.text ?? item?.forms.zh?.hans ?? itemId}”`,
      );
    },

    toggleFavourite(itemId) {
      const ov = get().vocab.overrides.get(itemId);
      void get().setOverride(itemId, { favourite: !ov?.favourite });
    },

    async saveCustomItem(item, summary) {
      const st = get();
      set({ customItems: [...st.customItems.filter((i) => i.id !== item.id), { ...item, custom: true }] });
      rebuildVocab();
      await repo.putCustomItem(st.profileId, { ...item, custom: true }).catch(persistError);
      await get().logChange(summary);
    },

    async deleteCustomItem(itemId) {
      const st = get();
      const item = st.vocab.items.get(itemId);
      set({
        customItems: st.customItems.filter((i) => i.id !== itemId),
        overrides: st.overrides.filter((o) => o.itemId !== itemId),
      });
      rebuildVocab();
      await repo.deleteCustomItem(st.profileId, itemId).catch(persistError);
      await get().logChange(`Deleted the word “${item?.forms.en?.text ?? item?.forms.zh?.hans ?? itemId}”`);
    },

    async saveBoard(board, summary) {
      const st = get();
      const previous = st.userBoards.find((b) => b.id === board.id) ?? dataset.boards.find((b) => b.id === board.id);
      set({ userBoards: [...st.userBoards.filter((b) => b.id !== board.id), board] });
      await repo.putBoard(st.profileId, board, previous).catch(persistError);
      await get().logChange(summary);
    },

    async deleteBoard(boardId) {
      const st = get();
      const board = st.userBoards.find((b) => b.id === boardId);
      set({ userBoards: st.userBoards.filter((b) => b.id !== boardId) });
      if (st.settings.activeBoard === boardId) get().updateSettings({ activeBoard: null });
      await repo.deleteBoard(st.profileId, boardId).catch(persistError);
      await get().logChange(`Deleted the board “${board?.name.en ?? boardId}”`);
    },

    async updateCategoryPrefs(patch, summary) {
      const data = get().data;
      set({ data: { ...data, categoryPrefs: { ...data.categoryPrefs, ...patch } } });
      await repo.putProfileData(get().data).catch(persistError);
      if (summary) await get().logChange(summary);
    },

    async saveQuickGroups(quickGroups) {
      set({ data: { ...get().data, quickGroups } });
      await repo.putProfileData(get().data).catch(persistError);
    },

    async saveCustomSign(sign) {
      set({ customSigns: [...get().customSigns.filter((s) => s.id !== sign.id), sign] });
      await repo.putCustomSign(get().profileId, sign).catch(persistError);
      await get().logChange(`Added a sign for “${get().vocab.items.get(sign.itemId)?.forms.en?.text ?? sign.itemId}”`);
    },

    async deleteCustomSign(id) {
      set({ customSigns: get().customSigns.filter((s) => s.id !== id) });
      await repo.deleteCustomSign(id).catch(persistError);
    },

    noteSignViewed(itemId) {
      const data = get().data;
      const recentSigns = [itemId, ...data.recentSigns.filter((x) => x !== itemId)].slice(0, 30);
      set({ data: { ...data, recentSigns } });
      saveData();
    },

    async clearLearned() {
      set({ data: { ...get().data, bigrams: {}, usage: {} } });
      await repo.putProfileData(get().data).catch(persistError);
    },

    async logChange(summary) {
      const st = get();
      if (st.profileId === 'temporary') return;
      await repo.logChange(st.profileId, st.helperUnlocked ? 'helper' : 'user', summary).catch(() => {});
    },

    // ---------------- Profiles ----------------

    async switchProfile(id) {
      speech.stop();
      const [bundle, profiles] = await Promise.all([repo.loadProfile(id), repo.listProfiles()]);
      applyBundle(bundle, profiles);
    },

    async addProfile(name) {
      const p = await repo.createProfile(name, { onboarded: false });
      await get().switchProfile(p.id);
    },

    async renameProfile(id, name) {
      await repo.renameProfile(id, name);
      set({ profiles: await repo.listProfiles() });
    },

    async deleteProfile(id) {
      await repo.deleteProfile(id);
      const profiles = await repo.listProfiles();
      if (!profiles.length) {
        const p = await repo.createProfile('Me');
        await get().switchProfile(p.id);
      } else if (id === get().profileId) await get().switchProfile(profiles[0]!.id);
      else set({ profiles });
    },

    async reloadProfile() {
      const profiles = await repo.listProfiles();
      const id = profiles.find((p) => p.id === get().profileId)?.id ?? profiles[0]?.id;
      if (!id) {
        const p = await repo.createProfile('Me');
        return get().switchProfile(p.id);
      }
      await get().switchProfile(id);
    },

    // ---------------- Signs and search ----------------

    async loadSigns() {
      if (get().signPack) return get().signPack;
      try {
        const pack = await loadSignPack();
        set({ signPack: pack });
        return pack;
      } catch {
        return null;
      }
    },

    getSearchIndex() {
      const st = get();
      if (!searchCache || searchCache.version !== st.vocabVersion) {
        searchCache = { version: st.vocabVersion, index: buildIndex(st.vocab.items.values(), st.vocab.categories) };
      }
      return searchCache.index;
    },
  };
});

/** Shortcut for components: const t = useT(); t('speak') */
export function useT() {
  useStore((s) => s.settings.uiLang);
  return useStore.getState().t;
}

export function displayText(item: VocabItem, lang: Lang, traditional: boolean): string {
  return (lang === 'en' ? item.forms.en?.text : traditional ? item.forms.zh?.hant : item.forms.zh?.hans) ?? '';
}

/** Sign resources available for an item in the chosen sign language, best first. */
export function signsFor(itemId: string, st: Pick<Store, 'signPack' | 'customSigns' | 'settings' | 'vocab'>): SignResource[] {
  const lang = st.settings.signLanguage;
  if (lang === 'none') return [];
  const out: SignResource[] = st.customSigns.filter((s) => s.itemId === itemId && (s.signLanguage === lang));
  if (lang === 'nzsl' && st.signPack) {
    const ids = st.signPack.links[itemId] ?? [];
    ids.forEach((sid, rank) => {
      const s = st.signPack!.signs[sid];
      if (!s) return;
      out.push({
        id: sid,
        itemId,
        signLanguage: 'nzsl',
        region: 'New Zealand',
        type: 'video',
        gloss: s.gloss,
        maori: s.maori,
        hint: s.hint,
        usage: s.usage,
        video: s.video,
        remoteVideo: s.remoteVideo,
        image: s.image,
        source: s.source,
        attribution: st.signPack!.attribution,
        license: st.signPack!.license,
        verification: 'dictionary-match',
        rank: rank + 1,
      });
    });
  }
  const ov = st.vocab.overrides.get(itemId);
  if (ov?.signChoice === null) return out.filter((s) => s.verification === 'custom');
  if (ov?.signChoice) {
    out.sort((a, b) => (a.id === ov.signChoice ? -1 : b.id === ov.signChoice ? 1 : 0));
    const first = out[0];
    if (first && first.id === ov.signChoice && ov.signReviewed && first.verification === 'dictionary-match') {
      out[0] = { ...first, verification: 'reviewed' };
    }
  }
  return out;
}
