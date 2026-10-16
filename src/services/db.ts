// Local storage on the device (IndexedDB via Dexie). Nothing here is sent anywhere.
// Each table that holds personal data is keyed by profile so profiles stay separate.
// When the schema changes, add a new version() below with an upgrade function; never edit old ones.
import Dexie, { type Table } from 'dexie';
import type { Board, Category, HistoryEntry, SavedMessage, SignResource, Token, VocabItem } from '../domain/types';
import type { Settings } from '../domain/settings';
import type { CategoryPrefs, ItemOverride, UsageStat } from '../domain/vocabulary';
import type { Bigrams } from '../domain/predict';

export interface ProfileRow {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export interface SettingsRow {
  profileId: string;
  settings: Settings;
}

export interface OverrideRow extends ItemOverride {
  profileId: string;
}

export interface CustomItemRow {
  profileId: string;
  id: string;
  item: VocabItem;
  createdAt: number;
}

export interface CustomCategoryRow {
  profileId: string;
  id: string;
  category: Category;
}

export interface BoardRow {
  profileId: string;
  id: string;
  board: Board;
}

export interface BoardSnapshotRow {
  id?: number;
  profileId: string;
  boardId: string;
  at: number;
  board: Board;
}

export interface ProfileDataRow {
  profileId: string;
  categoryPrefs: CategoryPrefs;
  bigrams: Bigrams;
  usage: Record<string, UsageStat>;
  recentSigns: string[];
  quickGroups?: { id: string; name: { en: string; zh: string }; items: string[] }[];
}

export interface ImageRow {
  id: string;
  profileId: string;
  /** Small version for tiles */
  thumb: Blob;
  /** Larger version for the detail view */
  full: Blob;
  createdAt: number;
}

export interface SessionRow {
  profileId: string;
  tokens: Token[];
  cursor: number | null;
  updatedAt: number;
}

export interface ChangeRow {
  id?: number;
  profileId: string;
  at: number;
  by: 'user' | 'helper';
  summary: string;
}

export interface CustomSignRow extends SignResource {
  profileId: string;
}

export interface RestorePointRow {
  id?: number;
  at: number;
  reason: string;
  /** Full backup JSON of all profiles */
  data: string;
}

export class AppDB extends Dexie {
  profiles!: Table<ProfileRow, string>;
  settings!: Table<SettingsRow, string>;
  overrides!: Table<OverrideRow, [string, string]>;
  customItems!: Table<CustomItemRow, [string, string]>;
  customCategories!: Table<CustomCategoryRow, [string, string]>;
  boards!: Table<BoardRow, [string, string]>;
  boardSnapshots!: Table<BoardSnapshotRow, number>;
  profileData!: Table<ProfileDataRow, string>;
  images!: Table<ImageRow, string>;
  saved!: Table<SavedMessage, string>;
  history!: Table<HistoryEntry, string>;
  session!: Table<SessionRow, string>;
  changes!: Table<ChangeRow, number>;
  customSigns!: Table<CustomSignRow, string>;
  restorePoints!: Table<RestorePointRow, number>;

  constructor(name = 'sayable') {
    super(name);
    this.version(1).stores({
      profiles: 'id, name',
      settings: 'profileId',
      overrides: '[profileId+itemId], profileId',
      customItems: '[profileId+id], profileId',
      customCategories: '[profileId+id], profileId',
      boards: '[profileId+id], profileId',
      boardSnapshots: '++id, [profileId+boardId], at',
      profileData: 'profileId',
      images: 'id, profileId',
      saved: 'id, profileId, createdAt',
      history: 'id, profileId, at',
      session: 'profileId',
      changes: '++id, profileId, at',
      customSigns: 'id, profileId, itemId',
      restorePoints: '++id, at',
    });
  }
}

export const db = new AppDB();

/** Tables that belong to a profile, used for export, import and deletion. */
export const PROFILE_TABLES = [
  'settings', 'overrides', 'customItems', 'customCategories', 'boards', 'boardSnapshots', 'profileData',
  'images', 'saved', 'history', 'session', 'changes', 'customSigns',
] as const;
