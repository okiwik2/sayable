// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/services/db';
import * as repo from '../../src/services/repo';
import { exportProfiles, importBackup, validateBackup, listRestorePoints, restoreFrom, validateBoardExport } from '../../src/services/backup';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

async function makeProfile(name: string) {
  const p = await repo.createProfile(name);
  await repo.putCustomItem(p.id, { id: 'my-1', kind: 'word', pos: 'noun', category: 'people', categories: ['people'], forms: { en: { text: `${name}'s dog` } }, frequency: 0.5, custom: true });
  await repo.putSaved({ id: `s-${name}`, profileId: p.id, text: 'Hello', tokens: [], lang: 'en', createdAt: 1, uses: 0 });
  return p;
}

describe('backups', () => {
  it('round-trips profiles through export and import', async () => {
    await makeProfile('Ana');
    const backup = await exportProfiles();
    const checked = validateBackup(JSON.parse(JSON.stringify(backup)));
    expect(checked.ok).toBe(true);
    await db.delete();
    await db.open();
    const ids = await importBackup(checked.value!, 'replace');
    expect(ids).toHaveLength(1);
    const bundle = await repo.loadProfile(ids[0]!);
    expect(bundle.profile.name).toBe('Ana');
    expect(bundle.customItems[0]!.forms.en!.text).toBe("Ana's dog");
    expect(bundle.saved).toHaveLength(1);
  });

  it('adding a backup never overwrites an existing profile', async () => {
    const p = await makeProfile('Ana');
    const backup = await exportProfiles();
    const ids = await importBackup(backup, 'add');
    expect(ids[0]).not.toBe(p.id);
    const all = await repo.listProfiles();
    expect(all.map((x) => x.name).sort()).toEqual(['Ana', 'Ana (imported)']);
    // The original is untouched.
    expect((await repo.loadProfile(p.id)).saved).toHaveLength(1);
  });

  it('rejects files that are not backups, or are damaged, with plain messages', () => {
    expect(validateBackup({ hello: 1 }).errors[0]).toMatch(/not a Sayable backup/);
    expect(validateBackup({ format: 'sayable-backup', version: 99, profiles: [] }).errors[0]).toMatch(/newer version/);
    const damaged = {
      format: 'sayable-backup', version: 1,
      profiles: [{ profile: { id: 'p', name: 'X' }, tables: { customItems: [{ item: { id: 'a', forms: {} } }], images: [{ id: 'i', thumb: 'nope', full: 'nope' }] } }],
    };
    const r = validateBackup(damaged);
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/no English or Chinese text/);
    expect(r.errors.join(' ')).toMatch(/picture is damaged/);
    expect(validateBoardExport({ format: 'sayable-board', version: 1, board: {}, items: [], images: [] }).ok).toBe(false);
  });

  it('saves a restore point before importing, and can go back to it', async () => {
    await makeProfile('Ana');
    const other = await exportProfiles();
    other.profiles[0]!.profile.name = 'Ben';
    other.profiles[0]!.profile.id = 'ben';
    await importBackup(other, 'replace');
    expect((await repo.listProfiles()).map((p) => p.name)).toEqual(['Ben']);
    const points = await listRestorePoints();
    expect(points.length).toBe(1);
    await restoreFrom(points[0]!.id);
    expect((await repo.listProfiles()).map((p) => p.name)).toEqual(['Ana']);
  });

  it('keeps profiles separate', async () => {
    const a = await makeProfile('Ana');
    const b = await makeProfile('Ben');
    await repo.deleteProfile(a.id);
    expect((await repo.listProfiles()).map((p) => p.id)).toEqual([b.id]);
    expect((await repo.loadProfile(b.id)).customItems).toHaveLength(1);
    expect(await db.customItems.where('profileId').equals(a.id).count()).toBe(0);
  });
});
