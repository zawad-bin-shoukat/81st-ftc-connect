import 'dotenv/config';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, open, readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import pg from 'pg';
import sharp from 'sharp';
import { PhotoStorageService } from '../dist/members/photo-storage.service.js';
import { applyPhotoEntry, photoPlan } from './lib/photo-import.mjs';

const args = process.argv.slice(2);
const [manifestArg, preparedArg, action, confirmation, limitFlag, limitArg] =
  args;
const applying = action === '--apply';
if (
  !manifestArg ||
  !preparedArg ||
  (args.length !== 2 &&
    !(applying && args.length === 6 && limitFlag === '--limit'))
) {
  throw new Error(
    'Usage: npm run photos:import -- <photo-manifest.json> <prepared directory> [--apply <preview digest> --limit 1..500]',
  );
}

const limit = applying ? Number(limitArg) : 0;
if (applying && (!Number.isInteger(limit) || limit < 1 || limit > 500))
  throw new Error('Apply limit must be an integer from 1 to 500.');

const databaseUrl = new URL(process.env.DATABASE_URL);
const local =
  databaseUrl.hostname === '127.0.0.1' &&
  databaseUrl.port === '55432' &&
  databaseUrl.pathname === '/ftc_connect';
const neon = databaseUrl.hostname.endsWith('.neon.tech');
if (!local && !neon)
  throw new Error('Photo import preview requires the local database or Neon.');
if (applying && !local)
  throw new Error(
    'Applying photos to Neon is disabled pending release review.',
  );

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
async function fileSha256(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

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

const entries = [];
const seenIds = new Set();
for (const entry of manifest.matched) {
  assert.ok(Number.isSafeInteger(entry.ftcId) && entry.ftcId > 0);
  assert.match(entry.section, /^[A-Z]$/);
  assert.match(entry.sourceSha256, /^[a-f0-9]{64}$/);
  assert.ok(!seenIds.has(entry.ftcId), `Duplicate FTC ID ${entry.ftcId}.`);
  seenIds.add(entry.ftcId);
  const copy = preparedById.get(entry.ftcId);
  assert.ok(copy, `Missing prepared copy for FTC ID ${entry.ftcId}.`);
  assert.equal(copy.section, entry.section);
  assert.equal(copy.sourceSha256, entry.sourceSha256);
  const paths = {};
  const hashes = {};
  for (const size of ['full', 'thumb']) {
    const path = resolve(preparedRoot, size, `${entry.ftcId}.jpg`);
    const file = await stat(path);
    assert.ok(file.isFile() && file.size === copy[`${size}Bytes`]);
    const metadata = await sharp(path).metadata();
    assert.equal(metadata.format, 'jpeg');
    assert.ok(!metadata.exif, 'Prepared image must not retain EXIF.');
    assert.ok(metadata.width > 0 && metadata.height > 0);
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
  connectionString: databaseUrl.toString(),
  connectionTimeoutMillis: 5000,
});
let receipt;
let locked = false;
async function main() {
  try {
    await db.connect();
    if (applying) {
      const result = await db.query(
        "SELECT pg_try_advisory_lock(hashtext('ftc-photo-import')) AS acquired",
      );
      if (!result.rows[0].acquired)
        throw new Error('Another photo import is running.');
      locked = true;
    }
    const { rows } = await db.query(
      'SELECT id, ftc_id, section, is_active, profile_photo_key FROM members',
    );
    const { ready, held, existing, digest } = photoPlan(
      entries,
      rows,
      databaseUrl.host + databaseUrl.pathname,
    );
    console.log(
      JSON.stringify(
        {
          activeMembers: rows.filter((member) => member.is_active).length,
          matchedPhotos: entries.length,
          ready: ready.length,
          alreadyHasPhoto: existing,
          heldForReview: held,
          absentFromApprovedRoster: manifest.unmatched.map(
            (entry) => entry.ftcId,
          ),
          previewDigest: digest,
          mode: applying ? 'local apply' : 'preview only',
        },
        null,
        2,
      ),
    );
    if (!applying) return;
    if (confirmation !== digest)
      throw new Error(
        'Preview digest changed. Run preview again; nothing uploaded.',
      );
    if (held.length)
      throw new Error(
        'Matched photos need review before applying; nothing uploaded.',
      );
    if (!ready.length) return;

    const receiptsDir = resolve('../../.local/photo-import-receipts');
    await mkdir(receiptsDir, { recursive: true, mode: 0o700 });
    const receiptPath = resolve(
      receiptsDir,
      `${Date.now()}-${randomBytes(4).toString('hex')}.jsonl`,
    );
    receipt = await open(receiptPath, 'wx', 0o600);
    console.log(`Private receipt: ${receiptPath}`);
    const storage = new PhotoStorageService();
    for (const entry of ready.slice(0, limit)) {
      await applyPhotoEntry(db, storage, entry);
      await receipt.appendFile(
        JSON.stringify({
          ftcId: entry.ftcId,
          section: entry.section,
          key: entry.key,
          fullSha256: entry.hashes.full,
          thumbSha256: entry.hashes.thumb,
          linkedAt: new Date().toISOString(),
        }) + '\n',
      );
      console.log(`Linked FTC ID ${entry.ftcId}.`);
    }
    console.log(
      `Import run finished: ${Math.min(ready.length, limit)} photos linked. Run a fresh preview to verify the remaining photos.`,
    );
  } finally {
    if (receipt) await receipt.close();
    if (locked)
      await db
        .query("SELECT pg_advisory_unlock(hashtext('ftc-photo-import'))")
        .catch(() => {});
    await db.end();
  }
}

await main();
