import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { readSheet } from 'read-excel-file/node';

export const headings = {
  timestamp: 'Timestamp',
  name: 'Name:',
  section: 'Section:',
  ftc_id: 'ID:',
  cadre: 'Cadre:',
  bcs_batch: 'BCS Batch:',
  education:
    'Education (Last Obtained Degree with Department, Ex: BSc. in Civil Engineering):',
  phone: 'WhatsApp Contact:',
  university: 'University:',
  blood_group: 'Blood Group:',
  email: 'Email:',
  home_district: 'Home District:',
  about_me: 'About Myself (Within 15 Words):',
  favourite_quotation: 'Favourite Quotation (Within 15 Words):',
};

const emailFixIds = [211, 736, 940, 1042, 1241, 1246];
const preferredIds = new Map([
  [738, 238],
  [850, 805],
]);
const text = (value) => (value == null ? '' : String(value));
const nonblank = (value) => /\S/u.test(text(value));
const emailPattern =
  /^[A-Za-z0-9!#$%&'*+/=?^_\x60{|}~-]+(\.[A-Za-z0-9!#$%&'*+/=?^_\x60{|}~-]+)*@[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

// Matching only: never use this value for the stored contact or a login identity.
export function phoneMatchKey(value) {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) return null;
  const digits = text(value)
    .replace(/[০-৯]/g, (digit) => String(digit.codePointAt(0) - 0x09e6))
    .replace(/\D/g, '');
  if (/^01\d{9}$/.test(digits)) return '+88' + digits;
  if (/^1\d{9}$/.test(digits)) return '+880' + digits;
  if (/^8801\d{9}$/.test(digits)) return '+' + digits;
  return null;
}

export function normalizeBatch(value) {
  const source = text(value).trim();
  if (!source || /^(N\/A|4r)$/i.test(source)) return null;
  if (/^43MS$/i.test(source)) return 43;
  const match = source.match(
    /^(\d+)\s*(?:(?:st|nd|rd|th)\s*)?(?:BCS|Batch)?$/i,
  );
  const batch = match ? Number(match[1]) : NaN;
  if (!Number.isInteger(batch) || batch < 1 || batch > 32767) {
    throw new Error('Unrecognized BCS batch');
  }
  return batch;
}

// Only recognizable labels are normalized. Unusual labels are retained,
// including job titles, BPATC, and misspellings not explicitly resolved.
export function normalizeCadre(value) {
  const raw = text(value);
  const key = raw
    .trim()
    .toLowerCase()
    .replace(/^bcs\s*/, '')
    .replace(/[()]/g, ' ')
    .replace(/\bcadre\b/g, ' ')
    .replace(/&/g, ' and ')
    .replace(/\s+/g, ' ')
    .trim();
  const aliases = {
    administration: 'Administration',
    livestock: 'Livestock',
    agriculture: 'Agriculture',
    taxation: 'Taxation',
    postal: 'Postal',
    fisheries: 'Fisheries',
    'foreign affairs': 'Foreign Affairs',
    'public health engineering': 'Public Health Engineering',
    'department of public health engineering': 'Public Health Engineering',
    information: 'Information',
    'information general': 'Information (General)',
    'audit and accounts': 'Audit and Accounts',
    'family planning': 'Family Planning',
    'roads and highway': 'Roads and Highways',
    'roads and highways': 'Roads and Highways',
    'roads and highway rhd': 'Roads and Highways',
    'public works': 'Public Works',
    'public works department': 'Public Works',
    'public works pwd': 'Public Works',
    pwd: 'Public Works',
    cooperative: 'Cooperatives',
    cooperatives: 'Cooperatives',
    'railway commercial and transport':
      'Railway (Transportation and Commercial)',
    'railway transportation and commercial':
      'Railway (Transportation and Commercial)',
    'railway engineering': 'Railway Engineering',
    forest: 'Forest',
    food: 'Food',
    'customs, excise and vat': 'Customs, Excise and VAT',
    trade: 'Trade',
  };
  return Object.hasOwn(aliases, key) ? aliases[key] : raw;
}

export function prepareRoster(rows) {
  const indices = Object.fromEntries(
    Object.entries(headings).map(([key, heading]) => {
      const matches =
        rows[0]
          ?.map((value, index) => (text(value).trim() === heading ? index : -1))
          .filter((i) => i >= 0) ?? [];
      if (matches.length !== 1)
        throw new Error('Missing or duplicate heading: ' + heading);
      return [key, matches[0]];
    }),
  );
  const submissions = rows
    .slice(1)
    .map((row, index) => ({
      excelRow: index + 2,
      data: Object.fromEntries(
        Object.entries(indices).map(([key, column]) => [key, row[column]]),
      ),
    }))
    .filter(({ data }) => Object.values(data).some(nonblank));
  if (submissions.length !== 560)
    throw new Error(
      'Expected the reviewed 560 submissions; review this workbook before importing.',
    );

  const corrections = [];
  for (const submission of submissions) {
    const data = submission.data;
    data.ftc_id = Number(data.ftc_id);
    if (
      !Number.isInteger(data.ftc_id) ||
      data.ftc_id <= 0 ||
      data.ftc_id > 2147483647
    ) {
      throw new Error('Invalid FTC ID at All row ' + submission.excelRow);
    }
    const email = text(data.email).trim();
    if (/@gmail$/i.test(email)) {
      if (!emailFixIds.includes(data.ftc_id))
        throw new Error(
          'An unapproved email correction is needed at All row ' +
            submission.excelRow,
        );
      corrections.push({
        excelRow: submission.excelRow,
        ftcId: data.ftc_id,
        field: 'email',
        rule: 'append .com',
      });
      data.email = email + '.com';
    } else {
      data.email = email;
    }
  }
  if (
    corrections.length !== 6 ||
    emailFixIds.some((id) => !corrections.some((item) => item.ftcId === id))
  ) {
    throw new Error(
      'The six approved email corrections changed; review the workbook.',
    );
  }

  const byPhone = new Map();
  for (const submission of submissions) {
    const raw = text(submission.data.phone).trim();
    if (!raw)
      throw new Error('Missing contact at All row ' + submission.excelRow);
    const key = phoneMatchKey(submission.data.phone) ?? 'raw:' + raw;
    if (!byPhone.has(key)) byPhone.set(key, []);
    byPhone.get(key).push(submission);
  }
  const duplicates = [...byPhone.values()].filter((group) => group.length > 1);
  if (duplicates.length !== 7 || submissions.length - byPhone.size !== 7) {
    throw new Error('The seven reviewed repeated-submission groups changed.');
  }
  const selections = [];
  const selected = [...byPhone.values()].map((group) => {
    let candidates = group;
    for (const [discardId, keepId] of preferredIds) {
      if (group.some(({ data }) => data.ftc_id === discardId)) {
        candidates = group.filter(({ data }) => data.ftc_id === keepId);
        if (!candidates.length)
          throw new Error(
            'Approved duplicate choice is missing: FTC ' + keepId,
          );
      }
    }
    if (
      group.length > 1 &&
      group.some(
        ({ data }) =>
          !(data.timestamp instanceof Date) ||
          !Number.isFinite(data.timestamp.getTime()),
      )
    ) {
      throw new Error('Repeated submission has an invalid timestamp.');
    }
    const chosen = candidates.toSorted(
      (a, b) => b.data.timestamp - a.data.timestamp || b.excelRow - a.excelRow,
    )[0];
    if (group.length > 1)
      selections.push({
        keptRow: chosen.excelRow,
        ftcId: chosen.data.ftc_id,
        discardedRows: group
          .filter((item) => item !== chosen)
          .map((item) => item.excelRow),
      });
    return chosen;
  });

  const members = selected
    .map(({ data, excelRow }) => {
      const member = {
        ftc_id: data.ftc_id,
        section: text(data.section).trim(),
        name: text(data.name),
        cadre: normalizeCadre(data.cadre),
        bcs_batch: normalizeBatch(data.bcs_batch),
        education: text(data.education),
        university: text(data.university),
        phone: text(data.phone),
        email: data.email,
        blood_group: text(data.blood_group),
        home_district: text(data.home_district),
        about_me: nonblank(data.about_me) ? text(data.about_me) : null,
        favourite_quotation: nonblank(data.favourite_quotation)
          ? text(data.favourite_quotation)
          : null,
      };
      for (const field of [
        'section',
        'name',
        'cadre',
        'education',
        'university',
        'phone',
        'email',
        'blood_group',
        'home_district',
      ]) {
        if (!nonblank(member[field]))
          throw new Error('Blank ' + field + ' at All row ' + excelRow);
      }
      for (const [field, limit] of Object.entries({
        section: 2,
        name: 150,
        cadre: 100,
        university: 255,
        email: 254,
        home_district: 100,
      })) {
        if ([...member[field]].length > limit)
          throw new Error(
            field + ' exceeds the database limit at All row ' + excelRow,
          );
      }
      if (
        !emailPattern.test(member.email) ||
        member.email.split('@')[0].length > 64
      ) {
        throw new Error(
          'Email still fails the agreed format at All row ' + excelRow,
        );
      }
      return { excelRow, ...member };
    })
    .toSorted((a, b) => a.ftc_id - b.ftc_id);
  for (const field of ['ftc_id', 'phone']) {
    if (
      new Set(members.map((member) => member[field])).size !== members.length
    ) {
      throw new Error('Unresolved unique field after deduplication: ' + field);
    }
  }
  if (members.length !== 553) throw new Error('Expected 553 distinct members.');
  return {
    members,
    summary: {
      sheet: 'All',
      submissions: submissions.length,
      blankRows: rows.length - 1 - submissions.length,
      members: members.length,
      cadres: new Set(members.map((member) => member.cadre)).size,
      unknownBatches: members.filter((member) => member.bcs_batch === null)
        .length,
      emailCorrections: corrections,
      duplicateSelections: selections,
    },
  };
}

export async function loadRoster(workbookPath) {
  const bytes = await readFile(workbookPath);
  const rows = await readSheet(bytes, 'All', { trim: false });
  return {
    ...prepareRoster(rows),
    sourceSha256: createHash('sha256').update(bytes).digest('hex'),
  };
}
