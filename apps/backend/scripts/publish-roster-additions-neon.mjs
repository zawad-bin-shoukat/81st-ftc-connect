import 'dotenv/config';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { readSheet } from 'read-excel-file/node';
import pg from 'pg';
import { phoneMatchKey } from './lib/roster.mjs';
import { importRoster } from './lib/import-roster.mjs';
import { prepareAdditions, sourceSha256 } from './import-roster-additions.mjs';

const [workbookPath, action, expectedDigest, backupFlag, backupPath] =
  process.argv.slice(2);
const applying = action === '--apply';
if (
  !workbookPath ||
  (process.argv.length !== 3 &&
    !(applying && process.argv.length === 7 && backupFlag === '--backup'))
)
  throw new Error(
    'Usage: node scripts/publish-roster-additions-neon.mjs <workbook.xlsx> [--apply <previewDigest> --backup <fresh Neon dump>]',
  );

const neonUrl = new URL(process.env.FTC_NEON_URL);
if (
  neonUrl.hostname !==
    'ep-sweet-wind-b3fcsz3o.c-4.ap-southeast-1.aws.neon.tech' ||
  neonUrl.pathname !== '/neondb'
)
  throw new Error(
    'FTC_NEON_URL does not point to the reviewed production Neon database.',
  );
const target = `${neonUrl.hostname}${neonUrl.pathname}`;

async function verifyBackup(path) {
  const pgRestore = [
    '/opt/homebrew/opt/postgresql@18/bin/pg_restore',
    '/opt/homebrew/opt/postgresql@16/bin/pg_restore',
  ].find(existsSync);
  if (!pgRestore) throw new Error('PostgreSQL restore tools are unavailable.');
  const file = await stat(path);
  const age = Date.now() - file.mtimeMs;
  if (!file.isFile() || age < 0 || age > 24 * 60 * 60 * 1000)
    throw new Error('A Neon backup from the last 24 hours is required.');
  const listing = spawnSync(pgRestore, ['--list', path], { encoding: 'utf8' });
  if (
    listing.status !== 0 ||
    !listing.stdout.includes('TABLE DATA public members') ||
    !listing.stdout.includes('TABLE DATA public cadres')
  )
    throw new Error(
      'Backup is unreadable or missing the member and cadre tables.',
    );
  const integrity = spawnSync(pgRestore, ['--file=/dev/null', path], {
    encoding: 'utf8',
  });
  if (integrity.status !== 0)
    throw new Error('Backup failed its restore-integrity check.');
}

const bytes = await readFile(workbookPath);
assert.equal(
  createHash('sha256').update(bytes).digest('hex'),
  sourceSha256,
  'The reviewed workbook changed; nothing was imported.',
);
const members = prepareAdditions(
  await readSheet(bytes, 'Form Responses 1', { trim: false }),
);
const connection = new pg.Client({
  connectionString: neonUrl.toString(),
  connectionTimeoutMillis: 10000,
});
try {
  await connection.connect();
  await connection.query('SET default_transaction_read_only = on');
  const [{ rows: current }, { rows: existing }] = await Promise.all([
    connection.query('SELECT count(*)::int AS count FROM members'),
    connection.query('SELECT ftc_id, phone, email FROM members'),
  ]);
  const memberIds = new Set(members.map((member) => member.ftc_id));
  const alreadyPresent = existing
    .filter((member) => memberIds.has(member.ftc_id))
    .map((member) => member.ftc_id)
    .sort((a, b) => a - b);
  const existingPhones = new Map(
    existing.map((member) => [phoneMatchKey(member.phone), member.ftc_id]),
  );
  const existingEmails = new Map(
    existing.map((member) => [member.email.toLowerCase(), member.ftc_id]),
  );
  const contactConflicts = members.flatMap((member) => {
    const conflicts = [
      existingPhones.get(phoneMatchKey(member.phone)),
      existingEmails.get(member.email.toLowerCase()),
    ].filter((id) => id && id !== member.ftc_id);
    return conflicts.length
      ? [{ ftcId: member.ftc_id, existingFtcIds: [...new Set(conflicts)] }]
      : [];
  });
  const digest = createHash('sha256')
    .update(
      JSON.stringify({
        sourceSha256,
        target,
        memberCount: current[0].count,
        alreadyPresent,
        contactConflicts,
        members,
      }),
    )
    .digest('hex');
  console.log(
    JSON.stringify(
      {
        target,
        currentMembers: current[0].count,
        reviewedAdditions: members.length,
        readyToInsert: members.length - alreadyPresent.length,
        alreadyPresent,
        contactConflicts,
        previewDigest: digest,
        mode: applying ? 'production apply requested' : 'read-only preview',
      },
      null,
      2,
    ),
  );
  if (applying) {
    if (digest !== expectedDigest)
      throw new Error(
        'Preview digest changed; nothing imported. Run a fresh preview.',
      );
    if (
      current[0].count !== 553 ||
      alreadyPresent.length ||
      contactConflicts.length
    )
      throw new Error(
        'The production roster differs from the reviewed 553-member state. Nothing imported.',
      );
    await verifyBackup(backupPath);
    await connection.query('SET default_transaction_read_only = off');
    const result = await importRoster(connection, members, {
      apply: true,
      expected: { inserted: 26, members: 579 },
    });
    console.log(JSON.stringify(result, null, 2));
  }
} finally {
  await connection.end();
}
