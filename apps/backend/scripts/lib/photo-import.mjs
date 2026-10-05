import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

export const sha256 = (value) =>
  createHash('sha256').update(value).digest('hex');

export function photoPlan(entries, rows, database) {
  const byId = new Map(rows.map((member) => [member.ftc_id, member]));
  const ready = [];
  const held = [];
  const existing = [];
  for (const entry of entries) {
    const member = byId.get(entry.ftcId);
    if (!member || !member.is_active || member.section !== entry.section) {
      held.push(entry.ftcId);
    } else if (member.profile_photo_key) {
      existing.push(entry.ftcId);
    } else {
      const key = `profiles/${member.id}/roster-${entry.sourceSha256.slice(0, 24)}`;
      ready.push({ ...entry, memberId: member.id, key });
    }
  }
  const digest = sha256(
    JSON.stringify({
      database,
      ready: ready.map((entry) => [
        entry.ftcId,
        entry.section,
        entry.memberId,
        entry.key,
        entry.hashes,
      ]),
      held,
      existing,
    }),
  );
  return { ready, held, existing, digest };
}

export async function applyPhotoEntry(db, storage, entry, load = readFile) {
  const current = await db.query(
    'SELECT profile_photo_key FROM members WHERE id=$1::uuid AND ftc_id=$2 AND section=$3 AND is_active=true',
    [entry.memberId, entry.ftcId, entry.section],
  );
  if (current.rowCount !== 1 || current.rows[0].profile_photo_key)
    throw new Error(
      `FTC ID ${entry.ftcId} changed during import. Stop and preview again.`,
    );
  const full = await load(entry.paths.full);
  const thumb = await load(entry.paths.thumb);
  if (
    sha256(full) !== entry.hashes.full ||
    sha256(thumb) !== entry.hashes.thumb
  )
    throw new Error(
      `Prepared FTC ID ${entry.ftcId} changed. Stop and preview again.`,
    );
  await storage.putPrepared(entry.key, { full, thumb });
  let updated;
  let failure;
  try {
    updated = await db.query(
      'UPDATE members SET profile_photo_key=$1 WHERE id=$2::uuid AND ftc_id=$3 AND section=$4 AND is_active=true AND profile_photo_key IS NULL RETURNING id',
      [entry.key, entry.memberId, entry.ftcId, entry.section],
    );
  } catch (error) {
    failure = error;
  }
  if (updated?.rowCount === 1) return { recovered: false };

  // If the database committed but its response was lost, keep the R2 objects.
  // If the state cannot be checked, keep them for a later retry instead of
  // risking a database reference to deleted storage.
  let after;
  try {
    after = await db.query(
      'SELECT profile_photo_key FROM members WHERE id=$1::uuid',
      [entry.memberId],
    );
  } catch {
    throw new Error(
      `FTC ID ${entry.ftcId} database result is uncertain. Stop and preview again; storage was retained.`,
      { cause: failure },
    );
  }
  if (after.rows[0]?.profile_photo_key === entry.key)
    return { recovered: true };
  await storage.remove(entry.key);
  throw (
    failure ??
    new Error(
      `FTC ID ${entry.ftcId} changed during upload. Stop and preview again.`,
    )
  );
}
