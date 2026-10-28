import 'dotenv/config';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import pg from 'pg';

// Approved against the 579-member roster. BPATC (FTC 440) stays unresolved.
export const officialCadres = [
  'Administration',
  'Agriculture',
  'Ansar',
  'Audit and Accounts',
  'Cooperatives',
  'Customs and Excise',
  'Family Planning',
  'Fisheries',
  'Food',
  'Foreign Affairs',
  'Forest',
  'General Education',
  'Health',
  'Information',
  'Livestock',
  'Police',
  'Postal',
  'Public Health Engineering',
  'Public Works',
  'Railway Engineering',
  'Railway Transportation and Commercial',
  'Roads and Highways',
  'Statistics',
  'Taxation',
  'Technical Education',
  'Trade',
];

export const cadreMap = new Map([
  [',Admin', 'Administration'],
  ['Admin', 'Administration'],
  ['Administration', 'Administration'],
  ['Agriculture', 'Agriculture'],
  ['Agriculture Extension Officer', 'Agriculture'],
  ['Agriculture Marketing Officer', 'Agriculture'],
  ['Audit and Accounts', 'Audit and Accounts'],
  ['BCE LIVESTOCK', 'Livestock'],
  ['BCS (Agriculture)MS', 'Agriculture'],
  ['Bcs family planing', 'Family Planning'],
  ['BPATC', null],
  ['BSC Administration', 'Administration'],
  ['BSC Livestock ', 'Livestock'],
  ['BXS Public Health Engineering ', 'Public Health Engineering'],
  ['Cooperatives', 'Cooperatives'],
  ['Customs, Excise and VAT', 'Customs and Excise'],
  ['Family Planning', 'Family Planning'],
  ['Fisheries', 'Fisheries'],
  ['Food', 'Food'],
  ['Foreign Affairs', 'Foreign Affairs'],
  ['Forest', 'Forest'],
  ['Information', 'Information'],
  ['Information (General)', 'Information'],
  ['Livestock', 'Livestock'],
  ['Postal', 'Postal'],
  ['Public Health Engineering', 'Public Health Engineering'],
  ['Public Works', 'Public Works'],
  [
    'Railway (Transportation and Commercial)',
    'Railway Transportation and Commercial',
  ],
  ['Railway Engineering', 'Railway Engineering'],
  ['Roads and Highways', 'Roads and Highways'],
  ['Taxation', 'Taxation'],
  ['Trade', 'Trade'],
]);
for (const name of officialCadres) {
  if (!cadreMap.has(name)) cadreMap.set(name, name);
}

async function main() {
  const [action, expectedDigest, backupPath] = process.argv.slice(2);
  const applying = action === '--apply';
  if (
    (process.argv.length !== 2 && !(applying && process.argv.length === 5)) ||
    (applying && (!expectedDigest || !backupPath))
  ) {
    throw new Error(
      'Usage: node scripts/normalize-cadres-neon.mjs [--apply <previewDigest> <freshBackup.dump>]',
    );
  }

  if (!process.env.FTC_NEON_URL)
    throw new Error('FTC_NEON_URL is not configured; no production connection was made.');
  const url = new URL(process.env.FTC_NEON_URL);
  if (
    url.hostname !==
      'ep-sweet-wind-b3fcsz3o.c-4.ap-southeast-1.aws.neon.tech' ||
    url.pathname !== '/neondb'
  ) {
    throw new Error(
      'FTC_NEON_URL does not point to the reviewed production database.',
    );
  }

  async function verifyBackup(path) {
    const pgRestore = [
      '/opt/homebrew/opt/postgresql@18/bin/pg_restore',
      '/opt/homebrew/opt/postgresql@16/bin/pg_restore',
    ].find(existsSync);
    if (!pgRestore) throw new Error('PostgreSQL restore tool is unavailable.');
    const file = await stat(path);
    const age = Date.now() - file.mtimeMs;
    if (!file.isFile() || age < 0 || age > 24 * 60 * 60 * 1000)
      throw new Error(
        'A production backup from the last 24 hours is required.',
      );
    const listing = spawnSync(pgRestore, ['--list', path], {
      encoding: 'utf8',
    });
    if (
      listing.status !== 0 ||
      !listing.stdout.includes('TABLE DATA public members') ||
      !listing.stdout.includes('TABLE DATA public cadres')
    )
      throw new Error('Backup is unreadable or missing members and cadres.');
    const integrity = spawnSync(pgRestore, ['--file=/dev/null', path], {
      encoding: 'utf8',
    });
    if (integrity.status !== 0)
      throw new Error('Backup integrity check failed.');
  }

  async function snapshot(client) {
    const { rows } = await client.query(`
    SELECT c.name, count(*)::int AS members,
           count(*) FILTER (WHERE m.is_active)::int AS active_members,
           array_agg(m.ftc_id) FILTER (WHERE c.name = 'BPATC') AS unresolved_ids
    FROM cadres c JOIN members m ON m.cadre_id = c.id
    GROUP BY c.name ORDER BY c.name
  `);
    const total = rows.reduce((sum, row) => sum + row.members, 0);
    const active = rows.reduce((sum, row) => sum + row.active_members, 0);
    assert.equal(total, 579, 'Production member count changed; review again.');
    assert.equal(active, 579, 'Active member count changed; review again.');
    assert.deepEqual(
      rows.find((row) => row.name === 'BPATC')?.unresolved_ids,
      [440],
    );
    for (const row of rows) {
      if (!cadreMap.has(row.name))
        throw new Error(`Unreviewed cadre label: ${row.name}`);
    }
    const before = rows.map(({ name, members }) => ({ name, members }));
    const after = new Map();
    for (const { name, members } of rows) {
      const target = cadreMap.get(name) ?? 'Unresolved (FTC 440)';
      after.set(target, (after.get(target) ?? 0) + members);
    }
    const digest = createHash('sha256')
      .update(JSON.stringify({ before, map: [...cadreMap], officialCadres }))
      .digest('hex');
    return {
      digest,
      before,
      after: [...after].sort((a, b) => a[0].localeCompare(b[0])),
    };
  }

  const client = new pg.Client({
    connectionString: url.toString(),
    connectionTimeoutMillis: 10000,
  });
  try {
    await client.connect();
    await client.query('SET default_transaction_read_only = on');
    const preview = await snapshot(client);
    console.log(
      JSON.stringify(
        {
          mode: applying ? 'apply requested' : 'read-only preview',
          target: url.hostname + url.pathname,
          ...preview,
        },
        null,
        2,
      ),
    );
    if (applying) {
      assert.equal(
        expectedDigest,
        preview.digest,
        'Preview changed; no update made.',
      );
      await verifyBackup(backupPath);
      await client.query('SET default_transaction_read_only = off');
      await client.query('BEGIN');
      try {
        await client.query("SET LOCAL lock_timeout = '5s'");
        await client.query(
          'LOCK TABLE members, cadres IN SHARE ROW EXCLUSIVE MODE',
        );
        assert.equal(
          (await snapshot(client)).digest,
          expectedDigest,
          'Production roster changed during update.',
        );
        for (const name of officialCadres) {
          await client.query(
            'INSERT INTO cadres (name) VALUES ($1) ON CONFLICT (name) DO NOTHING',
            [name],
          );
        }
        for (const [oldName, newName] of cadreMap) {
          if (newName === null || newName === oldName) continue;
          await client.query(
            `
          UPDATE members m SET cadre_id = target.id, updated_at = now()
          FROM cadres source, cadres target
          WHERE m.cadre_id = source.id AND source.name = $1 AND target.name = $2
        `,
            [oldName, newName],
          );
        }
        const { rows } = await client.query(`
        SELECT c.name, count(*)::int AS members
        FROM members m JOIN cadres c ON c.id = m.cadre_id
        WHERE m.is_active GROUP BY c.name ORDER BY c.name
      `);
        const expected = preview.after
          .map(([name, members]) => ({
            name: name === 'Unresolved (FTC 440)' ? 'BPATC' : name,
            members,
          }))
          .sort((a, b) => a.name.localeCompare(b.name));
        assert.deepEqual(
          rows.sort((a, b) => a.name.localeCompare(b.name)),
          expected,
        );
        await client.query('COMMIT');
        console.log(
          'Applied and verified the approved cadre mapping. FTC 440 remains BPATC.',
        );
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    await client.end();
  }
}

if (process.argv[1]?.endsWith('/normalize-cadres-neon.mjs'))
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
