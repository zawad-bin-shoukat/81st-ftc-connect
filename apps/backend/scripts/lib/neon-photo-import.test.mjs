import test from 'node:test';
import assert from 'node:assert/strict';
import { neonPhotoPlan } from './neon-photo-import.mjs';

const id = '00000000-0000-0000-0000-000000000101';
const key = `profiles/${id}/roster-${'a'.repeat(24)}`;
const entry = {
  ftcId: 101,
  section: 'A',
  sourceSha256: 'a'.repeat(64),
  fullBytes: 100,
  thumbBytes: 20,
};
const local = {
  id,
  ftc_id: 101,
  section: 'A',
  is_active: true,
  profile_photo_key: key,
};
const neon = { ...local, profile_photo_key: null };

test('plans a Neon link only when local and Neon profile identity matches', () => {
  const plan = neonPhotoPlan([entry], [local], [neon], 'neon.example/neondb');
  assert.equal(plan.ready.length, 1);
  assert.equal(plan.ready[0].key, key);
  assert.deepEqual(plan.alreadyLinked, []);
  assert.deepEqual(plan.conflicts, []);
});

test('treats an identical existing Neon key as an idempotent link', () => {
  const plan = neonPhotoPlan([entry], [local], [local], 'neon.example/neondb');
  assert.deepEqual(plan.ready, []);
  assert.equal(plan.alreadyLinked.length, 1);
});

test('holds differing member identities, photo keys, and roster sections', () => {
  const plan = neonPhotoPlan(
    [entry],
    [local],
    [
      {
        ...neon,
        id: '00000000-0000-0000-0000-000000000102',
        profile_photo_key: 'other',
      },
    ],
    'neon.example/neondb',
  );
  assert.deepEqual(plan.ready, []);
  assert.deepEqual(
    plan.conflicts.map(({ ftcId }) => ftcId),
    [101],
  );
});

test('refuses invalid local keys and duplicate roster identities', () => {
  assert.deepEqual(
    neonPhotoPlan(
      [entry],
      [{ ...local, profile_photo_key: 'bad-key' }],
      [neon],
      'db',
    ).conflicts.map(({ ftcId }) => ftcId),
    [101],
  );
  assert.throws(
    () => neonPhotoPlan([entry], [local, local], [neon], 'db'),
    /Duplicate FTC ID/,
  );
});
