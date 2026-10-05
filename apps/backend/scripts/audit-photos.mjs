import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, open, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { loadRoster } from './lib/roster.mjs';

const [workbookPath, photosPath, outputPath] = process.argv.slice(2);
if (!workbookPath || !photosPath || !outputPath || process.argv.length !== 5) {
  throw new Error(
    'Usage: node scripts/audit-photos.mjs <roster.xlsx> <Photos directory> <manifest.json>',
  );
}

const roster = await loadRoster(workbookPath);
const byId = new Map(roster.members.map((member) => [member.ftc_id, member]));
const matched = [];
const unmatched = [];
const invalid = [];
const seen = new Set();
const photosRoot = resolve(photosPath);

for (const sectionEntry of (
  await readdir(photosRoot, { withFileTypes: true })
).toSorted((a, b) => a.name.localeCompare(b.name))) {
  if (!sectionEntry.isDirectory() || !/^Section [A-Z]$/.test(sectionEntry.name))
    continue;
  const section = sectionEntry.name.slice(-1);
  for (const fileEntry of (
    await readdir(join(photosRoot, sectionEntry.name), { withFileTypes: true })
  ).toSorted((a, b) => a.name.localeCompare(b.name))) {
    if (!fileEntry.isFile() || fileEntry.name === '.DS_Store') continue;
    const match = /^(\d+)(\.)?\.jpe?g$/i.exec(fileEntry.name);
    const sourcePath = join(photosRoot, sectionEntry.name, fileEntry.name);
    if (!match) {
      invalid.push({
        section,
        sourcePath,
        reason: 'Filename is not an FTC ID plus .jpg',
      });
      continue;
    }
    const ftcId = Number(match[1]);
    const member = byId.get(ftcId);
    const key = `${section}:${ftcId}`;
    if (seen.has(key)) {
      invalid.push({
        section,
        ftcId,
        sourcePath,
        reason: 'Duplicate photo ID in section',
      });
      continue;
    }
    seen.add(key);
    const file = await open(sourcePath);
    const signature = Buffer.alloc(3);
    try {
      await file.read(signature, 0, 3, 0);
    } finally {
      await file.close();
    }
    if (signature.toString('hex') !== 'ffd8ff') {
      invalid.push({ section, ftcId, sourcePath, reason: 'Not a JPEG file' });
      continue;
    }
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(sourcePath)) hash.update(chunk);
    const entry = {
      ftcId,
      section,
      sourcePath,
      sourceSha256: hash.digest('hex'),
      sourceBytes: (await stat(sourcePath)).size,
      ...(match[2] ? { filenameNeedsReview: true } : {}),
    };
    if (!member)
      unmatched.push({
        ...entry,
        reason: 'FTC ID absent from approved roster',
      });
    else if (member.section !== section)
      invalid.push({ ...entry, reason: `Roster section is ${member.section}` });
    else matched.push(entry);
  }
}

if (matched.length === 0 || invalid.length > 0) {
  throw new Error(
    `Photo audit stopped: ${matched.length} matched, ${invalid.length} invalid. No manifest written.`,
  );
}

const manifest = {
  rosterSourceSha256: roster.sourceSha256,
  photosRoot,
  counts: {
    matched: matched.length,
    unmatched: unmatched.length,
    invalid: invalid.length,
  },
  matched,
  unmatched,
};
await writeFile(resolve(outputPath), JSON.stringify(manifest, null, 2) + '\n', {
  flag: 'wx',
  mode: 0o600,
});
console.log(
  `Matched ${matched.length} photos; held ${unmatched.length} without roster profiles. Originals unchanged.`,
);
console.log(`Manifest: ${resolve(outputPath)}`);
