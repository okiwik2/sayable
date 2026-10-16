// Reading and writing one profile's data. The UI store calls these; they never touch the network.
import { db, type ProfileDataRow, type ProfileRow, type SessionRow } from './db';
import { defaultSettings, migrateSettings, type Settings } from '../domain/settings';
import type { Board, Category, HistoryEntry, SavedMessage, SignResource, Token, VocabItem } from '../domain/types';
import { emptyCategoryPrefs, type ItemOverride } from '../domain/vocabulary';

export const newId = (prefix = '') => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export interface ProfileBundle {
  profile: ProfileRow;
  settings: Settings;
  overrides: ItemOverride[];
  customItems: VocabItem[];
  customCategories: Category[];
  boards: Board[];
  data: ProfileDataRow;
  saved: SavedMessage[];
  history: HistoryEntry[];
  session: SessionRow | undefined;
  customSigns: SignResource[];
}

export const emptyProfileData = (profileId: string): ProfileDataRow => ({
  profileId,
  categoryPrefs: emptyCategoryPrefs(),
  bigrams: {},
  usage: {},
  recentSigns: [],
});

export async function listProfiles(): Promise<ProfileRow[]> {
  return (await db.profiles.toArray()).sort((a, b) => a.createdAt - b.createdAt);
}

export async function createProfile(name: string, settings?: Partial<Settings>): Promise<ProfileRow> {
  const now = Date.now();
  const profile: ProfileRow = { id: newId('p'), name, createdAt: now, updatedAt: now };
  await db.transaction('rw', db.profiles, db.settings, db.profileData, async () => {
    await db.profiles.put(profile);
    await db.settings.put({ profileId: profile.id, settings: defaultSettings(settings) });
    await db.profileData.put(emptyProfileData(profile.id));
  });
  return profile;
}

export async function ensureProfile(): Promise<ProfileRow> {
  const all = await listProfiles();
  if (all.length) {
    const last = localStorageGet('sayable.lastProfile');
    return all.find((p) => p.id === last) ?? all[0]!;
  }
  return createProfile('Me');
}

export async function loadProfile(id: string): Promise<ProfileBundle> {
  const profile = await db.profiles.get(id);
  if (!profile) throw new Error('Profile not found');
  const [settingsRow, overrides, customItems, customCategories, boards, data, saved, history, session, customSigns] = await Promise.all([
    db.settings.get(id),
    db.overrides.where('profileId').equals(id).toArray(),
    db.customItems.where('profileId').equals(id).toArray(),
    db.customCategories.where('profileId').equals(id).toArray(),
    db.boards.where('profileId').equals(id).toArray(),
    db.profileData.get(id),
    db.saved.where('profileId').equals(id).toArray(),
    db.history.where('profileId').equals(id).toArray(),
    db.session.get(id),
    db.customSigns.where('profileId').equals(id).toArray(),
  ]);
  localStorageSet('sayable.lastProfile', id);
  const d = data ?? emptyProfileData(id);
  return {
    profile,
    settings: migrateSettings(settingsRow?.settings),
    overrides: overrides.map(({ profileId: _p, ...o }) => o),
    customItems: customItems.map((r) => r.item),
    customCategories: customCategories.map((r) => r.category),
    boards: boards.map((r) => r.board),
    data: { ...emptyProfileData(id), ...d, categoryPrefs: { ...emptyCategoryPrefs(), ...d.categoryPrefs } },
    saved: saved.sort((a, b) => b.createdAt - a.createdAt),
    history: history.sort((a, b) => b.at - a.at).slice(0, 300),
    session,
    customSigns: customSigns.map(({ profileId: _p, ...s }) => s as SignResource),
  };
}

export async function renameProfile(id: string, name: string) {
  await db.profiles.update(id, { name, updatedAt: Date.now() });
}

export async function deleteProfile(id: string) {
  await db.transaction('rw', [db.profiles, db.settings, db.overrides, db.customItems, db.customCategories, db.boards, db.boardSnapshots, db.profileData, db.images, db.saved, db.history, db.session, db.changes, db.customSigns], async () => {
    await db.profiles.delete(id);
    await db.settings.delete(id);
    await db.profileData.delete(id);
    await db.session.delete(id);
    for (const t of [db.overrides, db.customItems, db.customCategories, db.boards, db.boardSnapshots, db.images, db.saved, db.history, db.changes, db.customSigns]) {
      await (t as unknown as { where: (k: string) => { equals: (v: string) => { delete: () => Promise<number> } } })
        .where('profileId')
        .equals(id)
        .delete();
    }
  });
}

export const saveSettings = (profileId: string, settings: Settings) => db.settings.put({ profileId, settings });

export const putOverride = (profileId: string, ov: ItemOverride) => db.overrides.put({ ...ov, profileId });
export const deleteOverride = (profileId: string, itemId: string) => db.overrides.delete([profileId, itemId]);

export const putCustomItem = (profileId: string, item: VocabItem) =>
  db.customItems.put({ profileId, id: item.id, item, createdAt: Date.now() });

export async function deleteCustomItem(profileId: string, itemId: string) {
  await db.customItems.delete([profileId, itemId]);
  await db.overrides.delete([profileId, itemId]);
}

export const putCustomCategory = (profileId: string, category: Category) =>
  db.customCategories.put({ profileId, id: category.id, category });
export const deleteCustomCategory = (profileId: string, id: string) => db.customCategories.delete([profileId, id]);

/** Save a board, keeping the previous version so it can be restored. */
export async function putBoard(profileId: string, board: Board, previous?: Board) {
  await db.transaction('rw', db.boards, db.boardSnapshots, async () => {
    if (previous) {
      await db.boardSnapshots.add({ profileId, boardId: board.id, at: Date.now(), board: previous });
      const snaps = await db.boardSnapshots.where('[profileId+boardId]').equals([profileId, board.id]).sortBy('at');
      for (const old of snaps.slice(0, Math.max(0, snaps.length - 10))) await db.boardSnapshots.delete(old.id!);
    }
    await db.boards.put({ profileId, id: board.id, board: { ...board, updatedAt: Date.now() } });
  });
}

export const deleteBoard = (profileId: string, id: string) => db.boards.delete([profileId, id]);

export async function boardSnapshots(profileId: string, boardId: string) {
  return (await db.boardSnapshots.where('[profileId+boardId]').equals([profileId, boardId]).sortBy('at')).reverse();
}

export const putProfileData = (data: ProfileDataRow) => db.profileData.put(data);

export const putSaved = (msg: SavedMessage) => db.saved.put(msg);
export const deleteSaved = (id: string) => db.saved.delete(id);

export async function addHistory(entry: HistoryEntry) {
  await db.history.put(entry);
  const count = await db.history.where('profileId').equals(entry.profileId).count();
  if (count > 500) {
    const oldest = await db.history.where('profileId').equals(entry.profileId).sortBy('at');
    await db.history.bulkDelete(oldest.slice(0, count - 500).map((h) => h.id));
  }
}

export const clearHistory = (profileId: string) => db.history.where('profileId').equals(profileId).delete();

export const saveSession = (profileId: string, tokens: Token[], cursor: number | null) =>
  db.session.put({ profileId, tokens, cursor, updatedAt: Date.now() });

export async function logChange(profileId: string, by: 'user' | 'helper', summary: string) {
  await db.changes.add({ profileId, at: Date.now(), by, summary });
}

export async function listChanges(profileId: string) {
  return (await db.changes.where('profileId').equals(profileId).sortBy('at')).reverse().slice(0, 200);
}

export const putCustomSign = (profileId: string, sign: SignResource) => db.customSigns.put({ ...sign, profileId });
export const deleteCustomSign = (id: string) => db.customSigns.delete(id);

export function localStorageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function localStorageSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode or storage full: not essential */
  }
}

/** How much space the app uses on this device, when the browser can tell. */
export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    const e = await navigator.storage?.estimate?.();
    return e ? { usage: e.usage ?? 0, quota: e.quota ?? 0 } : null;
  } catch {
    return null;
  }
}

/** Ask the browser not to clear our data when space runs low. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
