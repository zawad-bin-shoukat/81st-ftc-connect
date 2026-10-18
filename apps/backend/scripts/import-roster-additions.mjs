import 'dotenv/config';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { readSheet } from 'read-excel-file/node';
import pg from 'pg';
import {
  headings,
  normalizeBatch,
  normalizeCadre,
  normalizeDistrict,
  phoneMatchKey,
} from './lib/roster.mjs';
import { importRoster } from './lib/import-roster.mjs';

// This one-time import is pinned to the client workbook reviewed in October 2026.
// Existing profiles are never included, so their edits cannot be overwritten.
export const sourceSha256 =
  'e91035d80f8346d3809cae44e209f6ab6031c8170987007bba0262fa4642be80';
const newIds = [
  224, 228, 235, 312, 412, 420, 444, 528, 538, 548, 618, 705, 708, 718, 723,
  725, 734, 735, 738, 747, 815, 1003, 1004, 1045, 1119, 1123,
];
const allowedDistricts = new Set([
  'Bagerhat',
  'Bandarban',
  'Barguna',
  'Barishal',
  'Bhola',
  'Bogura',
  'Brahmanbaria',
  'Chandpur',
  'Chapainawabganj',
  'Chattogram',
  'Chuadanga',
  "Cox's Bazar",
  'Cumilla',
  'Dhaka',
  'Dinajpur',
  'Faridpur',
  'Feni',
  'Gaibandha',
  'Gazipur',
  'Gopalganj',
  'Habiganj',
  'Jamalpur',
  'Jashore',
  'Jhalakathi',
  'Jhenaidah',
  'Joypurhat',
  'Khagrachhari',
  'Khulna',
  'Kishoreganj',
  'Kurigram',
  'Kushtia',
  'Lakshmipur',
  'Lalmonirhat',
  'Madaripur',
  'Magura',
  'Manikganj',
  'Meherpur',
  'Moulvibazar',
  'Munshiganj',
  'Mymensingh',
  'Naogaon',
  'Narail',
  'Narayanganj',
  'Narsingdi',
  'Natore',
  'Netrakona',
  'Nilphamari',
  'Noakhali',
  'Pabna',
  'Panchagarh',
  'Patuakhali',
  'Pirojpur',
  'Rajbari',
  'Rajshahi',
  'Rangamati',
  'Rangpur',
  'Satkhira',
  'Shariatpur',
  'Sherpur',
  'Sirajganj',
  'Sunamganj',
  'Sylhet',
  'Tangail',
  'Thakurgaon',
]);
const emailPattern =
  /^[A-Za-z0-9!#$%&'*+/=?^_\x60{|}~-]+(\.[A-Za-z0-9!#$%&'*+/=?^_\x60{|}~-]+)*@[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
const text = (value) => (value == null ? '' : String(value));

export function prepareAdditions(rows) {
  const columns = Object.fromEntries(
    Object.entries(headings).map(([key, label]) => {
      const matches = rows[0].flatMap((value, index) =>
        text(value).trim() === label ? [index] : [],
      );
      assert.equal(matches.length, 1, `Missing or repeated column ${key}`);
      return [key, matches[0]];
    }),
  );
  const submissions = rows
    .slice(1)
    .map((row, index) => ({
      excelRow: index + 2,
      data: Object.fromEntries(
        Object.entries(columns).map(([key, column]) => [key, row[column]]),
      ),
    }))
    .filter(({ data }) =>
      Object.values(data).some((value) => text(value).trim()),
    );
  assert.equal(submissions.length, 654, 'Workbook submission count changed');
  const byId = new Map();
  for (const entry of submissions) {
    const rawId = text(entry.data.ftc_id).trim();
    const id = rawId === 'E-528' ? 528 : Number(rawId);
    assert.ok(
      Number.isSafeInteger(id) && id > 0,
      `Invalid FTC ID at row ${entry.excelRow}`,
    );
    if (!byId.has(id)) byId.set(id, []);
    byId.get(id).push(entry);
  }
  // 8050 is an older, mistyped duplicate of the existing member FTC 805.
  const typo = byId.get(8050);
  assert.equal(typo?.length, 1);
  assert.equal(
    phoneMatchKey(typo[0].data.phone),
    phoneMatchKey(byId.get(805)[0].data.phone),
  );
  assert.equal(
    text(typo[0].data.email).trim().toLowerCase(),
    text(byId.get(805)[0].data.email).trim().toLowerCase(),
  );
  assert.equal(
    text(typo[0].data.name).trim().toLowerCase(),
    text(byId.get(805)[0].data.name).trim().toLowerCase(),
  );
  const old528 = byId
    .get(528)
    .find((entry) => text(entry.data.ftc_id).trim() === 'E-528');
  const numeric528 = byId
    .get(528)
    .find((entry) => text(entry.data.ftc_id).trim() === '528');
  assert.ok(old528 && numeric528, 'FTC 528 duplicate evidence changed');
  assert.equal(
    phoneMatchKey(old528.data.phone),
    phoneMatchKey(numeric528.data.phone),
  );
  assert.equal(
    text(old528.data.email).trim().toLowerCase(),
    text(numeric528.data.email).trim().toLowerCase(),
  );
  assert.equal(
    text(old528.data.name).trim().toLowerCase(),
    text(numeric528.data.name).trim().toLowerCase(),
  );
  const wanted = new Set(newIds);
  const members = newIds.map((id) => {
    const group = byId.get(id);
    assert.ok(group?.length, `Missing reviewed FTC ${id}`);
    for (const item of group)
      assert.ok(
        item.data.timestamp instanceof Date &&
          Number.isFinite(item.data.timestamp.getTime()),
        `Invalid date for FTC ${id}`,
      );
    const chosen = group.toSorted(
      (a, b) => b.data.timestamp - a.data.timestamp || b.excelRow - a.excelRow,
    )[0];
    if (id === 738)
      assert.notEqual(
        phoneMatchKey(chosen.data.phone),
        phoneMatchKey(byId.get(238)[0].data.phone),
        'The latest FTC 738 must be a different person from FTC 238',
      );
    const data = chosen.data;
    let email = text(data.email).trim();
    if (id === 528) {
      assert.ok(
        /@gmail$/i.test(email),
        'The approved FTC 528 correction changed',
      );
      email += '.com';
    }
    let homeDistrict = normalizeDistrict(data.home_district);
    if (homeDistrict === 'Bogra') homeDistrict = 'Bogura';
    const member = {
      excelRow: chosen.excelRow,
      ftc_id: id,
      section: text(data.section).trim(),
      name: text(data.name),
      cadre: normalizeCadre(data.cadre),
      bcs_batch: normalizeBatch(data.bcs_batch),
      education: text(data.education),
      university: text(data.university),
      phone: text(data.phone),
      email,
      blood_group: text(data.blood_group),
      home_district: homeDistrict,
      about_me: text(data.about_me).trim() || null,
      favourite_quotation: text(data.favourite_quotation).trim() || null,
    };
    assert.match(member.section, /^[A-Z]$/);
    assert.ok(member.name.trim() && member.name.length <= 150);
    assert.ok(member.cadre.trim() && member.cadre.length <= 100);
    assert.ok(
      member.education.trim() &&
        member.university.trim() &&
        member.university.length <= 255,
    );
    assert.ok(phoneMatchKey(member.phone));
    assert.ok(emailPattern.test(member.email) && member.email.length <= 254);
    assert.ok(
      member.blood_group.trim() && allowedDistricts.has(member.home_district),
    );
    return member;
  });
  assert.equal(members.length, 26);
  assert.equal(
    new Set(members.map((member) => member.phone)).size,
    members.length,
  );
  assert.equal(
    new Set(members.map((member) => member.email.toLowerCase())).size,
    members.length,
  );
  assert.ok(members.every((member) => wanted.has(member.ftc_id)));
  return members;
}

async function main() {
  const [workbookPath, flag] = process.argv.slice(2);
  if (!workbookPath || (flag && flag !== '--apply') || process.argv.length > 4)
    throw new Error(
      'Usage: node scripts/import-roster-additions.mjs <workbook.xlsx> [--apply]',
    );
  const url = new URL(process.env.DATABASE_URL);
  if (
    url.hostname !== '127.0.0.1' ||
    url.port !== '55432' ||
    url.pathname !== '/ftc_connect'
  )
    throw new Error(
      'This addition importer is restricted to the local database.',
    );
  const bytes = await readFile(workbookPath);
  assert.equal(
    createHash('sha256').update(bytes).digest('hex'),
    sourceSha256,
    'The reviewed workbook changed; stop and review it again',
  );
  const members = prepareAdditions(
    await readSheet(bytes, 'Form Responses 1', { trim: false }),
  );
  const client = new pg.Client({
    connectionString: url.toString(),
    connectionTimeoutMillis: 5000,
  });
  try {
    await client.connect();
    const existing = await client.query(
      'SELECT count(*)::int AS count FROM members',
    );
    assert.ok(
      existing.rows[0].count >= 553,
      'Expected the existing approved roster',
    );
    const result = await importRoster(client, members, {
      apply: flag === '--apply',
    });
    console.log(
      JSON.stringify(
        {
          workbookSha256: sourceSha256,
          sourceRows: members.map(({ ftc_id, excelRow }) => ({
            ftcId: ftc_id,
            excelRow,
          })),
          ...result,
        },
        null,
        2,
      ),
    );
  } finally {
    await client.end();
  }
}

if (process.argv[1]?.endsWith('/import-roster-additions.mjs'))
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
