import test from 'node:test';
import assert from 'node:assert/strict';
import { applyPhotoEntry, photoPlan, sha256 } from './photo-import.mjs';

const full = Buffer.from('prepared full image');
const thumb = Buffer.from('prepared thumbnail');
const entry = {
  ftcId: 101,
  section: 'A',
  memberId: '00000000-0000-0000-0000-000000000101',
  key: 'profiles/00000000-0000-0000-0000-000000000101/roster-abc',
  paths: { full: 'full.jpg', thumb: 'thumb.jpg' },
  hashes: { full: sha256(full), thumb: sha256(thumb) },
};
const load = async (path) => (path === 'full.jpg' ? full : thumb);

test('plan holds absent records and existing photos, and fixes keys and digest', () => {
  const entries = [
    {
      ftcId: 101,
      section: 'A',
      sourceSha256: 'a'.repeat(64),
      hashes: entry.hashes,
    },
    {
      ftcId: 102,
      section: 'B',
      sourceSha256: 'b'.repeat(64),
      hashes: entry.hashes,
    },
    {
      ftcId: 103,
      section: 'C',
      sourceSha256: 'c'.repeat(64),
      hashes: entry.hashes,
    },
  ];
  const rows = [
    {
      id: entry.memberId,
      ftc_id: 101,
      section: 'A',
      is_active: true,
      profile_photo_key: null,
    },
    {
      id: 'existing',
      ftc_id: 102,
      section: 'B',
      is_active: true,
      profile_photo_key: 'existing-key',
    },
  ];
  const plan = photoPlan(entries, rows, 'ftc_connect');
  assert.deepEqual(plan.held, [103]);
  assert.deepEqual(plan.existing, [102]);
  assert.equal(
    plan.ready[0].key,
    `profiles/${entry.memberId}/roster-${'a'.repeat(24)}`,
  );
  assert.equal(plan.digest, photoPlan(entries, rows, 'ftc_connect').digest);
  assert.notEqual(plan.digest, photoPlan(entries, rows, 'neondb').digest);
  assert.notEqual(
    plan.digest,
    photoPlan(
      entries,
      rows.map((row) =>
        row.ftc_id === 101 ? { ...row, profile_photo_key: 'new' } : row,
      ),
      'ftc_connect',
    ).digest,
  );
});

test('existing photo stops before storage upload', async () => {
  let uploaded = false;
  const db = {
    query: async () => ({
      rowCount: 1,
      rows: [{ profile_photo_key: 'existing' }],
    }),
  };
  await assert.rejects(
    applyPhotoEntry(
      db,
      {
        putPrepared: async () => {
          uploaded = true;
        },
      },
      entry,
      load,
    ),
    /changed during import/,
  );
  assert.equal(uploaded, false);
});

test('changed prepared bytes stop before storage upload', async () => {
  let uploaded = false;
  const db = {
    query: async () => ({ rowCount: 1, rows: [{ profile_photo_key: null }] }),
  };
  await assert.rejects(
    applyPhotoEntry(
      db,
      {
        putPrepared: async () => {
          uploaded = true;
        },
      },
      entry,
      async () => Buffer.from('changed'),
    ),
    /Prepared FTC ID/,
  );
  assert.equal(uploaded, false);
});

test('successful link uploads both prepared images and keeps objects', async () => {
  const calls = [];
  const db = {
    query: async (sql) =>
      sql.startsWith('SELECT')
        ? { rowCount: 1, rows: [{ profile_photo_key: null }] }
        : { rowCount: 1, rows: [{ id: entry.memberId }] },
  };
  const storage = {
    putPrepared: async (key, images) => {
      assert.equal(key, entry.key);
      assert.equal(images.full, full);
      assert.equal(images.thumb, thumb);
      calls.push('upload');
    },
    remove: async () => calls.push('remove'),
  };
  assert.deepEqual(await applyPhotoEntry(db, storage, entry, load), {
    recovered: false,
  });
  assert.deepEqual(calls, ['upload']);
});

test('compare-and-swap conflict removes only this new upload', async () => {
  const calls = [];
  let queryNumber = 0;
  const db = {
    query: async () => {
      queryNumber++;
      if (queryNumber === 1)
        return { rowCount: 1, rows: [{ profile_photo_key: null }] };
      if (queryNumber === 2) return { rowCount: 0, rows: [] };
      return { rowCount: 1, rows: [{ profile_photo_key: 'another-key' }] };
    },
  };
  const storage = {
    putPrepared: async () => calls.push('upload'),
    remove: async () => calls.push('remove'),
  };
  await assert.rejects(
    applyPhotoEntry(db, storage, entry, load),
    /changed during upload/,
  );
  assert.deepEqual(calls, ['upload', 'remove']);
});

test('lost database response preserves an attached photo', async () => {
  const calls = [];
  let queryNumber = 0;
  const db = {
    query: async () => {
      queryNumber++;
      if (queryNumber === 1)
        return { rowCount: 1, rows: [{ profile_photo_key: null }] };
      if (queryNumber === 2) throw new Error('connection lost');
      return { rowCount: 1, rows: [{ profile_photo_key: entry.key }] };
    },
  };
  const storage = {
    putPrepared: async () => calls.push('upload'),
    remove: async () => calls.push('remove'),
  };
  assert.deepEqual(await applyPhotoEntry(db, storage, entry, load), {
    recovered: true,
  });
  assert.deepEqual(calls, ['upload']);
});

test('unavailable database after upload retains objects for review', async () => {
  const calls = [];
  let queryNumber = 0;
  const db = {
    query: async () => {
      queryNumber++;
      if (queryNumber === 1)
        return { rowCount: 1, rows: [{ profile_photo_key: null }] };
      throw new Error('connection lost');
    },
  };
  const storage = {
    putPrepared: async () => calls.push('upload'),
    remove: async () => calls.push('remove'),
  };
  await assert.rejects(
    applyPhotoEntry(db, storage, entry, load),
    /result is uncertain/,
  );
  assert.deepEqual(calls, ['upload']);
});
