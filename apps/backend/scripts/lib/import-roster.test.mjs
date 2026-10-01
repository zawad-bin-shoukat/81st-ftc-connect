import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { importRoster } from './import-roster.mjs';

const url = new URL(process.env.DATABASE_URL);
assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.port, '55432');
assert.equal(url.pathname, '/ftc_connect');

const member = {
  excelRow: 2,
  ftc_id: 10001,
  section: 'A',
  name: 'Synthetic import check',
  cadre: 'Synthetic cadre',
  bcs_batch: null,
  education: 'Degree',
  university: 'University',
  phone: ' Raw Bengali contact ০১ ',
  email: 'import.test@example.com',
  blood_group: ' A ',
  home_district: 'District',
  about_me: null,
  favourite_quotation: null,
};

async function withTables(run) {
  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  try {
    // Session-local tables shadow the real ones and disappear on disconnect.
    await client.query(
      'CREATE TEMP TABLE cadres (LIKE public.cadres INCLUDING ALL)',
    );
    await client.query(
      'CREATE TEMP TABLE members (LIKE public.members INCLUDING ALL)',
    );
    await run(client);
  } finally {
    await client.end();
  }
}

test('dry run rolls back all rows; committed rerun is a no-op', async () => {
  await withTables(async (client) => {
    assert.equal((await importRoster(client, [member])).inserted, 1);
    assert.equal((await client.query('SELECT * FROM members')).rowCount, 0);
    assert.equal((await client.query('SELECT * FROM cadres')).rowCount, 0);
    await importRoster(client, [member], { apply: true });
    const before = (await client.query('SELECT * FROM members')).rows;
    const rerun = await importRoster(client, [member], { apply: true });
    assert.equal(rerun.inserted, 0);
    assert.equal(rerun.unchanged, 1);
    assert.deepEqual(
      (await client.query('SELECT * FROM members')).rows,
      before,
    );
    assert.equal(before[0].phone, member.phone);
    assert.equal(before[0].blood_group, member.blood_group);
  });
});

test('a later conflict rolls back earlier inserts without overwriting existing members', async () => {
  await withTables(async (client) => {
    await importRoster(client, [member], { apply: true });
    await assert.rejects(
      importRoster(
        client,
        [
          {
            ...member,
            ftc_id: 10002,
            phone: 'second-contact',
            cadre: 'New cadre',
          },
          { ...member, name: 'Changed name' },
        ],
        { apply: true },
      ),
      /will not overwrite/,
    );
    assert.equal((await client.query('SELECT * FROM members')).rowCount, 1);
    assert.equal((await client.query('SELECT * FROM cadres')).rowCount, 1);
    await assert.rejects(
      importRoster(
        client,
        [
          {
            ...member,
            ftc_id: 10002,
            phone: 'second-contact',
            email: 'bad email',
          },
        ],
        { apply: true },
      ),
      /members_email_format/,
    );
    assert.equal((await client.query('SELECT * FROM members')).rowCount, 1);
  });
});
