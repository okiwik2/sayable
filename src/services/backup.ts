// Backups: export everything (or one board) to a JSON file, and bring it back.
// Imports are checked first, a restore point is saved before anything changes,
// and the whole import happens in one database transaction, so a failure changes nothing.
import { db, PROFILE_TABLES, type ProfileRow } from './db';
import { blobToDataUrl, dataUrlToBlob } from './images';
import { newId } from './repo';
import type { Board, VocabItem } from '../domain/types';

export const BACKUP_FORMAT = 'sayable-backup';
export const BOARD_FORMAT = 'sayable-board';
export const BACKUP_VERSION = 1;

type Row = Record<string, unknown>;

export interface ProfileExport {
  profile: ProfileRow;
  tables: Record<string, Row[]>;
}

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  profiles: ProfileExport[];
}

export interface BoardExport {
  format: typeof BOARD_FORMAT;
  version: number;
  exportedAt: string;
  board: Board;
  /** Custom words used on the board, so it works on another device. */
  items: VocabItem[];
  images: { id: string; thumb: string; full: string }[];
}

async function serializeRow(table: string, row: Row): Promise<Row> {
  if (table !== 'images') return row;
  return { ...row, thumb: await blobToDataUrl(row.thumb as Blob), full: await blobToDataUrl(row.full as Blob) };
}

function deserializeRow(table: string, row: Row): Row {
  if (table !== 'images') return row;
  return { ...row, thumb: dataUrlToBlob(row.thumb as string), full: dataUrlToBlob(row.full as string) };
}

export async function exportProfiles(profileIds?: string[]): Promise<Backup> {
  const profiles = (await db.profiles.toArray()).filter((p) => !profileIds || profileIds.includes(p.id));
  const out: ProfileExport[] = [];
  for (const profile of profiles) {
    const tables: Record<string, Row[]> = {};
    for (const name of PROFILE_TABLES) {
      const rows = (await db.table(name).where('profileId').equals(profile.id).toArray()) as Row[];
      tables[name] = await Promise.all(rows.map((r) => serializeRow(name, r)));
    }
    out.push({ profile, tables });
  }
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), profiles: out };
}

export interface ValidationResult<T> {
  ok: boolean;
  errors: string[];
  value?: T;
}

const isObj = (v: unknown): v is Row => typeof v === 'object' && v !== null && !Array.isArray(v);

function validItem(item: unknown): string | null {
  if (!isObj(item)) return 'a word is not readable';
  if (typeof item.id !== 'string' || !item.id) return 'a word has no id';
  const forms = item.forms;
  if (!isObj(forms) || (!isObj(forms.en) && !isObj(forms.zh))) return `word "${item.id}" has no English or Chinese text`;
  if (isObj(forms.en) && typeof forms.en.text !== 'string') return `word "${item.id}" has unreadable English text`;
  if (isObj(forms.zh) && typeof forms.zh.hans !== 'string') return `word "${item.id}" has unreadable Chinese text`;
  return null;
}

function validImage(img: unknown): boolean {
  return isObj(img) && typeof img.id === 'string' && typeof img.thumb === 'string' && img.thumb.startsWith('data:image/') &&
    typeof img.full === 'string' && img.full.startsWith('data:image/');
}

/** Check a backup file before importing it. Messages are written for the person importing. */
export function validateBackup(json: unknown): ValidationResult<Backup> {
  const errors: string[] = [];
  if (!isObj(json)) return { ok: false, errors: ['This file is not a Sayable backup.'] };
  if (json.format !== BACKUP_FORMAT) return { ok: false, errors: ['This file is not a Sayable backup.'] };
  if (typeof json.version !== 'number' || json.version > BACKUP_VERSION) {
    return { ok: false, errors: ['This backup was made by a newer version of Sayable. Update the app first.'] };
  }
  if (!Array.isArray(json.profiles) || !json.profiles.length) return { ok: false, errors: ['The backup has no profiles in it.'] };
  json.profiles.forEach((p, i) => {
    const where = `Profile ${i + 1}`;
    if (!isObj(p) || !isObj(p.profile) || typeof p.profile.id !== 'string' || typeof p.profile.name !== 'string') {
      errors.push(`${where} is missing its name.`);
      return;
    }
    if (!isObj(p.tables)) {
      errors.push(`${where} ("${p.profile.name}") has no data.`);
      return;
    }
    for (const [name, rows] of Object.entries(p.tables)) {
      if (!(PROFILE_TABLES as readonly string[]).includes(name)) continue; // ignore unknown tables from the future
      if (!Array.isArray(rows)) {
        errors.push(`${where}: "${name}" is damaged.`);
        continue;
      }
      if (name === 'customItems') {
        for (const r of rows) {
          const e = validItem(isObj(r) ? r.item : null);
          if (e) errors.push(`${where}: ${e}.`);
        }
      }
      if (name === 'images') for (const r of rows) if (!validImage(r)) errors.push(`${where}: a picture is damaged.`);
      if (name === 'settings' && rows.some((r) => !isObj(r) || !isObj(r.settings))) errors.push(`${where}: settings are damaged.`);
    }
  });
  return errors.length ? { ok: false, errors: errors.slice(0, 20) } : { ok: true, errors: [], value: json as unknown as Backup };
}

export function validateBoardExport(json: unknown): ValidationResult<BoardExport> {
  if (!isObj(json) || json.format !== BOARD_FORMAT) return { ok: false, errors: ['This file is not a Sayable board.'] };
  if (typeof json.version !== 'number' || json.version > BACKUP_VERSION) {
    return { ok: false, errors: ['This board was made by a newer version of Sayable.'] };
  }
  const b = json.board;
  const errors: string[] = [];
  if (!isObj(b) || typeof b.id !== 'string' || !Array.isArray(b.cells) || !isObj(b.name)) errors.push('The board is damaged.');
  if (!Array.isArray(json.items)) errors.push('The board words are missing.');
  else for (const it of json.items) {
    const e = validItem(it);
    if (e) errors.push(e);
  }
  if (!Array.isArray(json.images) || json.images.some((i) => !validImage(i))) errors.push('A picture on the board is damaged.');
  return errors.length ? { ok: false, errors } : { ok: true, errors: [], value: json as unknown as BoardExport };
}

/** Save the current state of everything so an import can be undone. Keeps the last 5. */
export async function createRestorePoint(reason: string): Promise<number> {
  const data = JSON.stringify(await exportProfiles());
  const id = await db.restorePoints.add({ at: Date.now(), reason, data });
  const all = await db.restorePoints.orderBy('at').primaryKeys();
  for (const old of all.slice(0, Math.max(0, all.length - 5))) await db.restorePoints.delete(old);
  return id;
}

export async function listRestorePoints() {
  return (await db.restorePoints.orderBy('at').reverse().toArray()).map(({ id, at, reason }) => ({ id: id!, at, reason }));
}

const ALL_TABLES = () => [db.profiles, ...PROFILE_TABLES.map((t) => db.table(t))];

/**
 * Import a validated backup.
 *  - "add": profiles are added alongside existing ones (with new ids if they clash).
 *  - "replace": all existing profiles are replaced.
 * Returns the ids of the imported profiles.
 */
export async function importBackup(backup: Backup, mode: 'add' | 'replace'): Promise<string[]> {
  await createRestorePoint(mode === 'replace' ? 'Before replacing everything with a backup' : 'Before adding profiles from a backup');
  const imported: string[] = [];
  await db.transaction('rw', ALL_TABLES(), async () => {
    if (mode === 'replace') for (const t of ALL_TABLES()) await t.clear();
    const existing = new Set((await db.profiles.toArray()).map((p) => p.id));
    for (const p of backup.profiles) {
      const id = existing.has(p.profile.id) ? newId('p') : p.profile.id;
      const name = existing.has(p.profile.id) ? `${p.profile.name} (imported)` : p.profile.name;
      await db.profiles.put({ ...p.profile, id, name, updatedAt: Date.now() });
      for (const table of PROFILE_TABLES) {
        const rows = p.tables[table] ?? [];
        for (const row of rows) {
          const copy: Row = { ...deserializeRow(table, row), profileId: id };
          // Auto-increment tables get fresh keys.
          if (table === 'boardSnapshots' || table === 'changes') delete copy.id;
          // Saved messages, history, images and signs have global ids: keep them unique per import.
          if ((table === 'saved' || table === 'history' || table === 'customSigns') && id !== p.profile.id) copy.id = newId();
          await db.table(table).put(copy);
        }
      }
      imported.push(id);
    }
  });
  return imported;
}

export async function restoreFrom(pointId: number) {
  const point = await db.restorePoints.get(pointId);
  if (!point) throw new Error('That restore point no longer exists.');
  const parsed = validateBackup(JSON.parse(point.data));
  if (!parsed.ok || !parsed.value) throw new Error(parsed.errors.join(' '));
  const backup = parsed.value;
  await db.transaction('rw', ALL_TABLES(), async () => {
    for (const t of ALL_TABLES()) await t.clear();
    for (const p of backup.profiles) {
      await db.profiles.put(p.profile);
      for (const table of PROFILE_TABLES) {
        for (const row of p.tables[table] ?? []) await db.table(table).put(deserializeRow(table, row));
      }
    }
  });
}

export async function exportBoard(profileId: string, board: Board, customItems: VocabItem[]): Promise<BoardExport> {
  const used = new Set(board.cells.filter(Boolean) as string[]);
  const items = customItems.filter((i) => used.has(i.id));
  const imageIds = new Set<string>();
  for (const it of items) if (it.symbol?.set === 'custom') imageIds.add(String(it.symbol.id));
  const overrides = await db.overrides.where('profileId').equals(profileId).toArray();
  for (const o of overrides) if (used.has(o.itemId) && o.imageId) imageIds.add(o.imageId);
  const images = [];
  for (const id of imageIds) {
    const row = await db.images.get(id);
    if (row) images.push({ id, thumb: await blobToDataUrl(row.thumb), full: await blobToDataUrl(row.full) });
  }
  return { format: BOARD_FORMAT, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), board, items, images };
}

/** Bring a board into a profile as a new board (never overwrites an existing one). */
export async function importBoard(profileId: string, data: BoardExport): Promise<Board> {
  const board: Board = { ...data.board, id: newId('board-'), kind: data.board.kind === 'core' ? 'custom' : data.board.kind };
  await db.transaction('rw', db.boards, db.customItems, db.images, async () => {
    for (const img of data.images) {
      await db.images.put({ id: img.id, profileId, thumb: dataUrlToBlob(img.thumb), full: dataUrlToBlob(img.full), createdAt: Date.now() });
    }
    for (const item of data.items) {
      const existing = await db.customItems.get([profileId, item.id]);
      if (!existing) await db.customItems.put({ profileId, id: item.id, item, createdAt: Date.now() });
    }
    await db.boards.put({ profileId, id: board.id, board });
  });
  return board;
}

export function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
