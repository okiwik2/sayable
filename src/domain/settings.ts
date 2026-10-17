// Per-profile settings with safe defaults. Every setting can be changed later in Settings.
import type { CoreLevel, Lang, SignLanguageId } from './types';

export type UiLang = 'en' | 'zh';
export type CommLangs = 'en' | 'zh' | 'both';
export type Theme = 'system' | 'light' | 'dark' | 'contrast-light' | 'contrast-dark';
export type TileStyle = 'symbol-text' | 'text' | 'symbol';
export type ColourCoding = 'word-type' | 'category' | 'none';
export type Palette = 'standard' | 'colour-blind';
export type Activation = 'release' | 'press' | 'hold';
export type ScanMode = 'off' | 'auto' | 'step';
export type QuickBehaviour = 'keep' | 'replace' | 'append' | 'ask';
export type Density = 'comfortable' | 'compact';
export type TileSize = 'small' | 'medium' | 'large' | 'xlarge';

export interface PronunciationFix {
  id: string;
  lang: Lang;
  written: string;
  spoken: string;
}

export interface Contact {
  id: string;
  name: string;
  relation: string;
  phone: string;
}

export interface Settings {
  // Language
  uiLang: UiLang;
  commLangs: CommLangs;
  /** In "both" mode, the language a tap adds. */
  activeLang: Lang;
  traditional: boolean;
  showPinyin: boolean;
  showSecondLanguage: boolean;

  // Voice
  voices: Partial<Record<Lang, string>>;
  rate: number;
  pitch: number;
  volume: number;
  previewVolume: number;
  pauseBetweenLangsMs: number;
  speakEachWord: boolean;
  pronunciations: PronunciationFix[];

  // Display
  theme: Theme;
  tileStyle: TileStyle;
  textScale: number;
  tileSize: TileSize;
  density: Density;
  colourCoding: ColourCoding;
  palette: Palette;
  simplified: boolean;
  reduceMotion: boolean;
  /** Read setup, menus, windows and messages aloud (for blind and low-vision users). */
  voiceGuide: boolean;
  labelsOnTop: boolean;
  /** On phones held upright: 'simple' keeps only the essentials on screen. */
  phoneLayout: 'simple' | 'full';
  keepAwake: boolean;

  // Board
  coreLevel: CoreLevel;
  /** 0 = use the board's own layout */
  columns: number;
  returnToCoreAfterTopicWord: boolean;
  adaptiveOrder: boolean;
  showRecentRow: boolean;
  pinned: string[];
  phraseTilesSpeakNow: boolean;
  quickBehaviour: QuickBehaviour;
  autoCapitalize: boolean;
  autoPunctuate: boolean;
  restoreUnfinished: boolean;
  activeBoard: string | null;

  // Suggestions
  predictions: boolean;
  grammarHelp: boolean;
  learnFromMe: boolean;
  keepHistory: boolean;

  // Access
  activation: Activation;
  holdMs: number;
  debounceMs: number;
  dwell: boolean;
  dwellMs: number;
  scanMode: ScanMode;
  scanMs: number;
  haptics: boolean;
  confirmClear: boolean;

  // Signs
  signLanguage: SignLanguageId;
  showSignIndicator: boolean;
  signSpeed: number;
  signLoop: boolean;

  // Safety and about me
  aboutMe: {
    name: string; communication: string; medical: string; allergies: string; other: string;
    dob: string; conditions: string; medications: string; nhi: string; emergencyName: string; emergencyPhone: string; howToHelp: string;
  };
  // Optional safety features (all off until switched on in Settings › Safety)
  helpButton: boolean;
  helpHoldMs: number;
  emergencyRepeat: boolean;
  emergencyRepeatSec: number;
  attentionSound: boolean;
  medicalCard: boolean;
  painScale: boolean;
  shareLocation: boolean;
  contacts: Contact[];
  emergencyMessage: string;

  // Protection
  editLock: boolean;
  editPin: string;

  onboarded: boolean;
  tutorialDone: boolean;
}

export const DEFAULT_PINNED = ['q-yes', 'q-no', 'q-stop', 'q-help', 'q-break', 'q-wait'];

export function defaultSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    uiLang: 'en',
    commLangs: 'en',
    activeLang: 'en',
    traditional: false,
    showPinyin: true,
    showSecondLanguage: true,
    voices: {},
    rate: 1,
    pitch: 1,
    volume: 1,
    previewVolume: 0.35,
    pauseBetweenLangsMs: 150,
    speakEachWord: false,
    pronunciations: [],
    theme: 'system',
    tileStyle: 'symbol-text',
    textScale: 1,
    tileSize: 'medium',
    density: 'comfortable',
    colourCoding: 'word-type',
    palette: 'standard',
    simplified: false,
    reduceMotion: false,
    voiceGuide: false,
    labelsOnTop: false,
    phoneLayout: 'simple',
    keepAwake: false,
    coreLevel: 'standard',
    columns: 0,
    returnToCoreAfterTopicWord: false,
    adaptiveOrder: false,
    showRecentRow: false,
    pinned: DEFAULT_PINNED,
    phraseTilesSpeakNow: false,
    quickBehaviour: 'keep',
    autoCapitalize: true,
    autoPunctuate: true,
    restoreUnfinished: true,
    activeBoard: null,
    predictions: true,
    grammarHelp: true,
    learnFromMe: true,
    keepHistory: true,
    activation: 'release',
    holdMs: 400,
    debounceMs: 0,
    dwell: false,
    dwellMs: 1000,
    scanMode: 'off',
    scanMs: 1200,
    haptics: false,
    confirmClear: false,
    signLanguage: 'nzsl',
    showSignIndicator: true,
    signSpeed: 1,
    signLoop: true,
    aboutMe: { name: '', communication: '', medical: '', allergies: '', other: '', dob: '', conditions: '', medications: '', nhi: '', emergencyName: '', emergencyPhone: '', howToHelp: '' },
    helpButton: false,
    helpHoldMs: 800,
    emergencyRepeat: false,
    emergencyRepeatSec: 15,
    attentionSound: false,
    medicalCard: false,
    painScale: false,
    shareLocation: false,
    contacts: [],
    emergencyMessage: '',
    editLock: false,
    editPin: '',
    onboarded: false,
    tutorialDone: false,
    ...overrides,
  };
}

/** Fill in any settings added in newer versions, and drop unknown keys. */
export function migrateSettings(stored: Partial<Settings> | undefined): Settings {
  const base = defaultSettings();
  if (!stored) return base;
  const out = { ...base } as Record<string, unknown>;
  for (const key of Object.keys(base)) {
    const value = (stored as Record<string, unknown>)[key];
    if (value !== undefined && typeof value === typeof (base as unknown as Record<string, unknown>)[key]) out[key] = value;
  }
  const s = out as unknown as Settings;
  s.aboutMe = { ...base.aboutMe, ...(stored.aboutMe ?? {}) };
  return s;
}

/** Languages that tiles should show and accept. */
export function activeLangs(s: Pick<Settings, 'commLangs'>): Lang[] {
  return s.commLangs === 'both' ? ['en', 'zh'] : [s.commLangs];
}

export function primaryLang(s: Pick<Settings, 'commLangs' | 'activeLang'>): Lang {
  return s.commLangs === 'both' ? s.activeLang : s.commLangs;
}
