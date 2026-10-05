import 'dotenv/config';
import assert from 'node:assert/strict';
import { HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { mkdir, readFile, stat, open } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import pg from 'pg';
import { neonPhotoPlan } from './lib/neon-photo-import.mjs';

const args = process.argv.slice(2);
const [manifestArg, preparedArg, action, digestArg, backupFlag, backupArg] =
  args;
const applying = action === '--apply';
if (
  !manifestArg ||
  !preparedArg ||
  (args.length !== 2 &&
    !(applying && args.length === 6 && backupFlag === '--backup'))
) {
  throw new Error(
    'Usage: npm run photos:publish-neon -- <photo-manifest.json> <prepared directory> [--apply <preview digest> --backup <fresh Neon dump>]',
  );
}

function databaseUrl(value, name) {
  try {
    return new URL(value);
  } catch {
    throw new Error(`${name} is missing or invalid.`);
  }
}

const localUrl = databaseUrl(process.env.DATABASE_URL, 'DATABASE_URL');
if (
  localUrl.hostname !== '127.0.0.1' ||
  localUrl.port !== '55432' ||
  localUrl.pathname !== '/ftc_connect'
)
  throw new Error(
    'DATABASE_URL must point to the local photo-import database.',
  );
const neonUrl = databaseUrl(process.env.FTC_NEON_URL, 'FTC_NEON_URL');
if (!neonUrl.hostname.endsWith('.neon.tech'))
  throw new Error('FTC_NEON_URL must point to the Neon production database.');

const bucket = process.env.R2_BUCKET;
const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
if (!bucket || !accountId || !accessKeyId || !secretAccessKey)
  throw new Error('Private R2 photo-storage settings are incomplete.');
const storage = new S3Client({
  region: 'auto',
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId, secretAccessKey },
});

async function verifyObjects(entries, preparedById) {
  const failures = [];
  let next = 0;
  const workers = Array.from({ length: 8 }, async () => {
    while (next < entries.length) {
      const entry = entries[next++];
      const prepared = preparedById.get(entry.ftcId);
      for (const size of ['full', 'thumb']) {
        try {
          const head = await storage.send(
            new HeadObjectCommand({
              Bucket: bucket,
              Key: `${entry.key}/${size}.jpg`,
            }),
          );
          if (
            head.ContentLength !== prepared[`${size}Bytes`] ||
            head.ContentType?.toLowerCase() !== 'image/jpeg'
          )
            failures.push({
              ftcId: entry.ftcId,
              reason: `${size} object size/type differs`,
            });
        } catch {
          failures.push({
            ftcId: entry.ftcId,
            reason: `${size} object is unavailable`,
          });
        }
      }
    }
  });
  await Promise.all(workers);
  return failures;
}

async function rowsFor(client, ids, lock = false) {
  const { rows } = await client.query(
    `SELECT id, ftc_id, section, is_active, profile_photo_key
       FROM members WHERE ftc_id = ANY($1::int[])
       ORDER BY ftc_id${lock ? ' FOR UPDATE' : ''}`,
    [ids],
  );
  return rows;
}

function verifyBackup(path) {
  const pgRestore = [
    '/opt/homebrew/opt/postgresql@18/bin/pg_restore',
    '/opt/homebrew/opt/postgresql@16/bin/pg_restore',
  ].find(existsSync);
  if (!pgRestore)
    throw new Error('Install PostgreSQL client tools before applying.');
  const info = stat(path, { bigint: false });
  return info.then((backup) => {
    const age = Date.now() - backup.mtimeMs;
    if (!backup.isFile() || age < 0 || age > 24 * 60 * 60 * 1000)
      throw new Error(
        'Apply requires a valid Neon backup created within the last 24 hours.',
      );
    const listed = spawnSync(pgRestore, ['--list', path], { encoding: 'utf8' });
    if (
      listed.status !== 0 ||
      !listed.stdout.includes('TABLE DATA public members')
    )
      throw new Error(
        'The supplied backup is not a readable full database dump containing members.',
      );
  });
}

async function main() {
  const manifest = JSON.parse(await readFile(resolve(manifestArg), 'utf8'));
  const preparedRoot = resolve(preparedArg);
  const prepared = JSON.parse(
    await readFile(resolve(preparedRoot, 'prepared-manifest.json'), 'utf8'),
  );
  assert.equal(manifest.counts.matched, manifest.matched.length);
  assert.equal(prepared.length, manifest.matched.length);
  const preparedById = new Map(prepared.map((entry) => [entry.ftcId, entry]));
  assert.equal(
    preparedById.size,
    prepared.length,
    'Prepared FTC IDs must be unique.',
  );
  for (const item of prepared) {
    assert.ok(Number.isSafeInteger(item.ftcId) && item.ftcId > 0);
    assert.match(item.section, /^[A-Z]$/);
    assert.ok(Number.isSafeInteger(item.fullBytes) && item.fullBytes > 0);
    assert.ok(Number.isSafeInteger(item.thumbBytes) && item.thumbBytes > 0);
  }
  const entries = manifest.matched.map((entry) => {
    const image = preparedById.get(entry.ftcId);
    assert.ok(image, `Missing prepared photo for FTC ID ${entry.ftcId}.`);
    assert.equal(image.section, entry.section);
    assert.match(entry.sourceSha256, /^[a-f0-9]{64}$/);
    return {
      ...entry,
      fullBytes: image.fullBytes,
      thumbBytes: image.thumbBytes,
    };
  });
  const ids = entries.map((entry) => entry.ftcId);
  assert.equal(
    new Set(ids).size,
    ids.length,
    'Manifest FTC IDs must be unique.',
  );

  const local = new pg.Client({
    connectionString: localUrl.toString(),
    connectionTimeoutMillis: 5000,
  });
  const neon = new pg.Client({
    connectionString: neonUrl.toString(),
    connectionTimeoutMillis: 10000,
  });
  let inTransaction = false;
  try {
    await Promise.all([local.connect(), neon.connect()]);
    await local.query('SET default_transaction_read_only = on');
    const [localRows, neonRows] = await Promise.all([
      rowsFor(local, ids),
      rowsFor(neon, ids),
    ]);
    let plan = neonPhotoPlan(
      entries,
      localRows,
      neonRows,
      `${neonUrl.host}${neonUrl.pathname}`,
    );
    const objectCandidates = [...plan.ready, ...plan.alreadyLinked];
    const objectFailures = await verifyObjects(objectCandidates, preparedById);
    const report = {
      target: `${neonUrl.host}${neonUrl.pathname}`,
      localPhotoLinks: localRows.filter((row) => row.profile_photo_key).length,
      rosterPhotosInManifest: entries.length,
      readyToLink: plan.ready.length,
      alreadyLinked: plan.alreadyLinked.length,
      conflicts: plan.conflicts,
      unavailableOrMismatchedR2Objects: objectFailures,
      heldUntilRosterProfilesExist: (manifest.unmatched ?? []).map(
        (entry) => entry.ftcId,
      ),
      previewDigest: plan.digest,
      mode: applying ? 'production apply requested' : 'read-only preview',
    };
    console.log(JSON.stringify(report, null, 2));
    if (!applying) return;
    if (digestArg !== plan.digest)
      throw new Error(
        'Preview digest differs. Nothing changed; run a fresh preview.',
      );
    if (plan.conflicts.length || objectFailures.length)
      throw new Error(
        'Resolve every conflict and R2 object check before applying. Nothing changed.',
      );
    await verifyBackup(backupArg);

    await neon.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
    inTransaction = true;
    const lock = await neon.query(
      "SELECT pg_try_advisory_xact_lock(hashtext('ftc-photo-import')) AS acquired",
    );
    if (!lock.rows[0].acquired)
      throw new Error('Another photo import is running.');
    const lockedRows = await rowsFor(neon, ids, true);
    plan = neonPhotoPlan(
      entries,
      localRows,
      lockedRows,
      `${neonUrl.host}${neonUrl.pathname}`,
    );
    if (plan.digest !== digestArg || plan.conflicts.length)
      throw new Error(
        'Neon profiles changed after preview. Nothing was committed; run a new preview.',
      );
    for (const entry of plan.ready) {
      const result = await neon.query(
        `UPDATE members SET profile_photo_key = $1
          WHERE id = $2::uuid AND ftc_id = $3 AND section = $4
            AND is_active = true AND profile_photo_key IS NULL RETURNING id`,
        [entry.key, entry.memberId, entry.ftcId, entry.section],
      );
      if (result.rowCount !== 1)
        throw new Error(
          `FTC ID ${entry.ftcId} changed during apply; transaction will roll back.`,
        );
    }
    await neon.query('COMMIT');
    inTransaction = false;
    console.log(`Committed ${plan.ready.length} profile photo links to Neon.`);
  } finally {
    if (inTransaction) await neon.query('ROLLBACK').catch(() => {});
    await Promise.all([
      local.end().catch(() => {}),
      neon.end().catch(() => {}),
    ]);
    storage.destroy();
  }
}

main().catch((error) => {
  const safeMessage = String(error?.message ?? error)
    .replaceAll(localUrl.toString(), '[local database URL]')
    .replaceAll(neonUrl.toString(), '[Neon database URL]');
  console.error(`Photo publish stopped: ${safeMessage}`);
  process.exitCode = 1;
});
