import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import pg from 'pg';

// Never run mutation checks against the imported roster or Neon.
const local = new URL(process.env.DATABASE_URL);
assert.equal(local.hostname, '127.0.0.1');
assert.equal(local.port, '55432');
assert.equal(local.pathname, '/ftc_connect');

const name = 'ftc_retention_test_' + randomBytes(6).toString('hex');
const adminUrl = new URL(local);
adminUrl.pathname = '/postgres';
const testUrl = new URL(local);
testUrl.pathname = '/' + name;
const admin = new pg.Client({ connectionString: adminUrl.toString() });
let test;
let created = false;

try {
  await admin.connect();
  await admin.query('CREATE DATABASE "' + name + '"');
  created = true;
  test = new pg.Client({ connectionString: testUrl.toString() });
  await test.connect();

  for (const migration of (await readdir('prisma/migrations'))
    .filter((item) => /^\d/.test(item))
    .sort()) {
    await test.query(
      await readFile(`prisma/migrations/${migration}/migration.sql`, 'utf8'),
    );
  }

  await test.query(`
    INSERT INTO cadres (name) VALUES ('Retention fixture');
    INSERT INTO members
      (ftc_id, section, name, cadre_id, education, university, phone,
       email, blood_group, home_district)
    VALUES
      (19001, 'A', 'Synthetic member',
       (SELECT id FROM cadres WHERE name = 'Retention fixture'),
       'Degree', 'University', 'Synthetic contact', 'fixture@example.com',
       'A+', 'District');
    INSERT INTO accounts (member_id, login_phone, verification_method)
    VALUES ((SELECT id FROM members WHERE ftc_id = 19001),
            '+8801700019001', 'local');
    INSERT INTO test_accounts (test_id, phone, profile)
    VALUES (19001, '+8801700019002', '{}'::jsonb);

    INSERT INTO otp_challenges
      (id, phone, purpose, code_hash, expires_at)
    VALUES
      (gen_random_uuid(), '+8801700019011', 'login', repeat('a', 64),
       now() - interval '2 hours'),
      (gen_random_uuid(), '+8801700019012', 'login', repeat('b', 64),
       now() + interval '1 day');
    INSERT INTO test_otp_challenges
      (id, phone, delivery_mode, code_hash, expires_at)
    VALUES
      (gen_random_uuid(), '+8801700019021', 'local', repeat('a', 64),
       now() - interval '2 hours'),
      (gen_random_uuid(), '+8801700019022', 'local', repeat('b', 64),
       now() + interval '1 day');
    INSERT INTO auth_rate_limits (key, expires_at)
    VALUES (repeat('a', 64), now() - interval '2 hours'),
           (repeat('b', 64), now() + interval '1 day');

    INSERT INTO auth_sessions (token_hash, account_id, expires_at, revoked_at)
    VALUES
      (repeat('a', 64), (SELECT id FROM accounts),
       now() - interval '2 hours', NULL),
      (repeat('b', 64), (SELECT id FROM accounts),
       now() + interval '1 day', now() - interval '2 hours'),
      (repeat('c', 64), (SELECT id FROM accounts),
       now() + interval '1 day', NULL);
    INSERT INTO test_sessions
      (token_hash, test_account_id, expires_at, revoked_at)
    VALUES
      (repeat('a', 64), (SELECT id FROM test_accounts),
       now() - interval '2 hours', NULL),
      (repeat('b', 64), (SELECT id FROM test_accounts),
       now() + interval '1 day', now() - interval '2 hours'),
      (repeat('c', 64), (SELECT id FROM test_accounts),
       now() + interval '1 day', NULL);

    INSERT INTO claim_invites
      (member_id, token_hash, expires_at, consumed_at, revoked_at)
    VALUES
      ((SELECT id FROM members), repeat('a', 64),
       now() - interval '31 days', NULL, NULL),
      ((SELECT id FROM members), repeat('b', 64),
       now() + interval '1 day', now() - interval '31 days', NULL),
      ((SELECT id FROM members), repeat('c', 64),
       now() + interval '1 day', NULL, now() - interval '31 days'),
      ((SELECT id FROM members), repeat('d', 64),
       now() + interval '1 day', NULL, NULL);

    INSERT INTO registration_requests
      (ftc_id, name, phone, evidence, status, created_at, reviewed_at)
    VALUES
      (19011, 'Old pending', '+8801700019111', 'Synthetic', 'pending',
       now() - interval '91 days', NULL),
      (19012, 'Recent pending', '+8801700019112', 'Synthetic', 'pending',
       now(), NULL),
      (19013, 'Old rejected', '+8801700019113', 'Synthetic', 'rejected',
       now() - interval '100 days', now() - interval '91 days'),
      (19014, 'Recent approved', '+8801700019114', 'Synthetic', 'approved',
       now() - interval '2 days', now());
  `);

  await test.query(await readFile('prisma/retention.sql', 'utf8'));

  const survivors = [
    ['otp_challenges', 'phone', ['+8801700019012']],
    ['test_otp_challenges', 'phone', ['+8801700019022']],
    ['auth_rate_limits', 'key', ['b'.repeat(64)]],
    ['auth_sessions', 'token_hash', ['c'.repeat(64)]],
    ['test_sessions', 'token_hash', ['c'.repeat(64)]],
    ['claim_invites', 'token_hash', ['d'.repeat(64)]],
    ['registration_requests', 'ftc_id', [19012, 19014]],
  ];
  for (const [table, column, expected] of survivors) {
    const result = await test.query(`SELECT ${column} FROM ${table} ORDER BY ${column}`);
    assert.deepEqual(
      result.rows.map((row) => row[column]),
      expected,
      `Unexpected survivors in ${table}`,
    );
  }
  for (const table of ['members', 'accounts', 'test_accounts']) {
    const result = await test.query(`SELECT count(*)::int AS total FROM ${table}`);
    assert.equal(result.rows[0].total, 1, `${table} was changed`);
  }
  console.log('All retention cases passed in a disposable database.');
} finally {
  if (test) await test.end();
  if (created) await admin.query('DROP DATABASE "' + name + '" WITH (FORCE)');
  await admin.end();
}
