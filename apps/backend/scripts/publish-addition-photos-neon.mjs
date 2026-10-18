import 'dotenv/config';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, open, readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import pg from 'pg';
import sharp from 'sharp';
import { readSheet } from 'read-excel-file/node';
import { PhotoStorageService } from '../dist/members/photo-storage.service.js';
import { applyPhotoEntry, photoPlan } from './lib/photo-import.mjs';
import { prepareAdditions, sourceSha256 } from './import-roster-additions.mjs';

const [
  workbookArg,
  manifestArg,
  preparedArg,
  action,
  confirmation,
  backupFlag,
  backupArg,
  limitFlag,
  limitArg,
] = process.argv.slice(2);
const applying = action === '--apply';
if (
  !workbookArg ||
  !manifestArg ||
  !preparedArg ||
  (process.argv.length !== 5 &&
    !(
      applying &&
      process.argv.length === 11 &&
      backupFlag === '--backup' &&
      limitFlag === '--limit'
    ))
)
  throw new Error(
    'Usage: node scripts/publish-addition-photos-neon.mjs <workbook.xlsx> <manifest.json> <prepared dir> [--apply <digest> --backup <fresh dump> --limit 1..24]',
  );
const limit = applying ? Number(limitArg) : 0;
if (applying && (!Number.isInteger(limit) || limit < 1 || limit > 24))
  throw new Error('Apply limit must be 1..24.');
const neonUrl = new URL(process.env.FTC_NEON_URL);
if (
  neonUrl.hostname !==
    'ep-sweet-wind-b3fcsz3o.c-4.ap-southeast-1.aws.neon.tech' ||
  neonUrl.pathname !== '/neondb'
)
  throw new Error(
    'FTC_NEON_URL does not point to the reviewed production Neon database.',
  );
const target = `${neonUrl.host}${neonUrl.pathname}`;
const expectedIds = [
  224, 228, 235, 312, 412, 420, 444, 528, 538, 548, 618, 705, 708, 718, 723,
  725, 734, 735, 738, 747, 815, 1003, 1004, 1045,
];
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
async function fileSha256(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}
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
    !listing.stdout.includes('TABLE DATA public members')
  )
    throw new Error('Backup is unreadable or missing members.');
  const integrity = spawnSync(pgRestore, ['--file=/dev/null', path], {
    encoding: 'utf8',
  });
  if (integrity.status !== 0)
    throw new Error('Backup failed its restore-integrity check.');
}

const workbookBytes = await readFile(resolve(workbookArg));
assert.equal(
  sha256(workbookBytes),
  sourceSha256,
  'The approved workbook changed.',
);
const people = new Map(
  prepareAdditions(
    await readSheet(workbookBytes, 'Form Responses 1', { trim: false }),
  ).map((person) => [person.ftc_id, person]),
);
const manifestBytes = await readFile(resolve(manifestArg));
assert.equal(
  sha256(manifestBytes),
  '3bf2e775656952fd008179a3e4f45068af3e3c626029863dfa8f440db1c1e759',
  'The approved photo manifest changed.',
);
const manifest = JSON.parse(manifestBytes);
assert.equal(manifest.rosterSourceSha256, sourceSha256);
assert.equal(manifest.counts.matched, 24);
assert.equal(manifest.matched.length, 24);
assert.equal(manifest.unmatched.length, 0);
assert.deepEqual(
  manifest.matched.map((entry) => entry.ftcId),
  expectedIds,
);
const preparedRoot = resolve(preparedArg);
const preparedBytes = await readFile(
  resolve(preparedRoot, 'prepared-manifest.json'),
);
assert.equal(
  sha256(preparedBytes),
  'aba646f9c05b0d9c75d303bbd052e9780b0d7e2c1c35c981f5ba0bf6a54d5ac3',
  'The approved prepared manifest changed.',
);
const prepared = JSON.parse(preparedBytes);
assert.deepEqual(
  prepared.map((entry) => entry.ftcId),
  expectedIds,
);

const entries = [];
for (const entry of manifest.matched) {
  const person = people.get(entry.ftcId);
  assert.equal(
    person?.section,
    entry.section,
    `FTC ${entry.ftcId} section changed.`,
  );
  assert.ok(
    resolve(entry.sourcePath).startsWith(resolve(manifest.photosRoot) + '/'),
  );
  assert.equal(
    await fileSha256(entry.sourcePath),
    entry.sourceSha256,
    `Original FTC ${entry.ftcId} photo changed.`,
  );
  const copy = prepared.find((item) => item.ftcId === entry.ftcId);
  assert.equal(copy.section, entry.section);
  assert.equal(copy.sourceSha256, entry.sourceSha256);
  const paths = {},
    hashes = {};
  for (const size of ['full', 'thumb']) {
    const path = resolve(preparedRoot, size, `${entry.ftcId}.jpg`);
    const file = await stat(path);
    assert.equal(file.size, copy[`${size}Bytes`]);
    const metadata = await sharp(path).metadata();
    assert.equal(metadata.format, 'jpeg');
    assert.ok(!metadata.exif);
    assert.ok(
      Math.max(metadata.width, metadata.height) <=
        (size === 'full' ? 1280 : 320),
    );
    paths[size] = path;
    hashes[size] = await fileSha256(path);
  }
  entries.push({ ...entry, paths, hashes });
}

const db = new pg.Client({
  connectionString: neonUrl.toString(),
  connectionTimeoutMillis: 10000,
});
let receipt;
try {
  await db.connect();
  await db.query('SET default_transaction_read_only = on');
  const { rows } = await db.query(
    'SELECT id, ftc_id, section, name, phone, is_active, profile_photo_key FROM members',
  );
  const roster = new Map(rows.map((row) => [row.ftc_id, row]));
  const identityConflicts = entries.flatMap((entry) => {
    const row = roster.get(entry.ftcId);
    const person = people.get(entry.ftcId);
    return row &&
      row.section === person.section &&
      row.name === person.name &&
      row.phone === person.phone &&
      row.is_active
      ? []
      : [entry.ftcId];
  });
  const { ready, held, existing, digest } = photoPlan(entries, rows, target);
  const differentPhoto = existing.filter((id) => {
    const entry = entries.find((item) => item.ftcId === id);
    const row = roster.get(id);
    return (
      row.profile_photo_key !==
      `profiles/${row.id}/roster-${entry.sourceSha256.slice(0, 24)}`
    );
  });
  const report = {
    target,
    activeMembers: rows.filter((row) => row.is_active).length,
    approvedPhotos: entries.length,
    ready: ready.length,
    alreadyLinked: existing.filter((id) => !differentPhoto.includes(id)),
    identityConflicts,
    held,
    differentPhoto,
    previewDigest: digest,
    mode: applying ? 'production apply requested' : 'read-only preview',
  };
  console.log(JSON.stringify(report, null, 2));
  if (applying) {
    if (confirmation !== digest)
      throw new Error('Preview changed; nothing uploaded.');
    if (
      report.activeMembers !== 579 ||
      identityConflicts.length ||
      held.length ||
      differentPhoto.length
    )
      throw new Error('Roster/photo mismatch; nothing uploaded.');
    await verifyBackup(backupArg);
    await db.query('SET default_transaction_read_only = off');
    await mkdir(resolve('../../.local/photo-import-receipts'), {
      recursive: true,
      mode: 0o700,
    });
    const receiptPath = resolve(
      '../../.local/photo-import-receipts',
      `${Date.now()}-${randomBytes(4).toString('hex')}.jsonl`,
    );
    receipt = await open(receiptPath, 'wx', 0o600);
    console.log(`Private receipt: ${receiptPath}`);
    const storage = new PhotoStorageService();
    for (const entry of ready.slice(0, limit)) {
      const current = await db.query(
        'SELECT name, phone FROM members WHERE id=$1::uuid AND ftc_id=$2',
        [entry.memberId, entry.ftcId],
      );
      const person = people.get(entry.ftcId);
      if (
        current.rowCount !== 1 ||
        current.rows[0].name !== person.name ||
        current.rows[0].phone !== person.phone
      )
        throw new Error(
          `FTC ${entry.ftcId} identity changed; stop and preview again.`,
        );
      await applyPhotoEntry(db, storage, entry);
      await receipt.appendFile(
        JSON.stringify({
          ftcId: entry.ftcId,
          key: entry.key,
          fullSha256: entry.hashes.full,
          thumbSha256: entry.hashes.thumb,
          linkedAt: new Date().toISOString(),
        }) + '\n',
      );
      console.log(`Linked FTC ID ${entry.ftcId}.`);
    }
    console.log(
      `Batch finished: ${Math.min(ready.length, limit)} photos linked. Preview again.`,
    );
  }
} finally {
  if (receipt) await receipt.close();
  await db.end();
}
