import { createHash } from 'node:crypto';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const rosterKey = /^profiles\/([0-9a-f-]{36})\/roster-[a-f0-9]{24}$/i;

export function neonPhotoPlan(entries, localRows, neonRows, database) {
  const duplicateIds = (rows) => {
    const ids = new Set();
    for (const row of rows) {
      if (ids.has(row.ftc_id))
        throw new Error(`Duplicate FTC ID ${row.ftc_id} in database.`);
      ids.add(row.ftc_id);
    }
    return new Map(rows.map((row) => [row.ftc_id, row]));
  };

  const localById = duplicateIds(localRows);
  const neonById = duplicateIds(neonRows);
  const ready = [];
  const alreadyLinked = [];
  const conflicts = [];
  const seen = new Set();

  for (const entry of entries) {
    const { ftcId, section } = entry;
    if (seen.has(ftcId))
      throw new Error(`Duplicate photo manifest FTC ID ${ftcId}.`);
    seen.add(ftcId);
    const local = localById.get(ftcId);
    const neon = neonById.get(ftcId);
    if (
      !local ||
      !local.is_active ||
      local.section !== section ||
      !local.profile_photo_key
    ) {
      conflicts.push({
        ftcId,
        reason: 'local photo or active roster profile is missing',
      });
      continue;
    }
    const keyMatch = rosterKey.exec(local.profile_photo_key);
    if (!keyMatch || keyMatch[1].toLowerCase() !== local.id.toLowerCase()) {
      conflicts.push({
        ftcId,
        reason: 'local photo key does not match its profile',
      });
      continue;
    }
    if (!neon || !neon.is_active || neon.section !== section) {
      conflicts.push({
        ftcId,
        reason:
          'Neon roster profile is missing, inactive, or in another section',
      });
      continue;
    }
    if (neon.id !== local.id) {
      conflicts.push({
        ftcId,
        reason: 'local and Neon member identities differ',
      });
      continue;
    }
    if (
      neon.profile_photo_key &&
      neon.profile_photo_key !== local.profile_photo_key
    ) {
      conflicts.push({
        ftcId,
        reason: 'Neon already has a different photo key',
      });
      continue;
    }
    const planned = {
      ftcId,
      section,
      memberId: neon.id,
      key: local.profile_photo_key,
      sourceSha256: entry.sourceSha256,
      fullBytes: entry.fullBytes,
      thumbBytes: entry.thumbBytes,
    };
    if (neon.profile_photo_key === local.profile_photo_key)
      alreadyLinked.push(planned);
    else ready.push(planned);
  }

  const digest = sha256(
    JSON.stringify({ database, ready, alreadyLinked, conflicts }),
  );
  return { ready, alreadyLinked, conflicts, digest };
}
