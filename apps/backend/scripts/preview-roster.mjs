import { readSheet } from 'read-excel-file/node';

const workbookPath = process.argv[2];
if (!workbookPath) {
  throw new Error('Provide the workbook path.');
}

const rows = await readSheet(workbookPath, 'All');
if (rows.length === 0) {
  throw new Error('The All sheet is empty.');
}

const idColumn = rows[0].indexOf('ID:');
const emailColumn = rows[0].indexOf('Email:');
const phoneColumn = rows[0].indexOf('WhatsApp Contact:');
const timestampColumn = rows[0].indexOf('Timestamp');
if ([idColumn, emailColumn, phoneColumn, timestampColumn].includes(-1)) {
  throw new Error('The All sheet headings have changed.');
}

const submissions = rows.slice(1)
  .map((row, index) => ({ row, excelRow: index + 2 }))
  .filter(({ row }) => row.some(
    (value) => value !== null && value !== undefined && String(value).trim() !== '',
  ));
console.log(`Participant rows: ${submissions.length}`);
console.log(`Blank rows ignored: ${rows.length - 1 - submissions.length}`);
console.log(`Columns: ${rows[0].length}`);

const expectedEmailFixIds = new Set([211, 736, 940, 1042, 1241, 1246]);
const emailFixes = [];
for (const { row } of submissions) {
  const email = String(row[emailColumn] ?? '').trim();
  if (/@gmail$/i.test(email)) {
    emailFixes.push({ ftcId: Number(row[idColumn]), before: email, after: `${email}.com` });
  }
}

const foundIds = new Set(emailFixes.map(({ ftcId }) => ftcId));
if (
  emailFixes.length !== expectedEmailFixIds.size ||
  [...expectedEmailFixIds].some((id) => !foundIds.has(id))
) {
  throw new Error('The six expected email corrections do not match the All sheet.');
}

console.log(`Proposed email corrections: ${emailFixes.length}`);
for (const { ftcId, before, after } of emailFixes) {
  console.log(`FTC ${ftcId}: ${before} → ${after}`);
}

// Used only to recognize repeated submissions; the stored contact stays raw text.
function phoneMatchKey(value) {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) return null;
  const digits = String(value ?? '')
    .replace(/[০-৯]/g, (digit) => String(digit.codePointAt(0) - 0x09e6))
    .replace(/\D/g, '');
  if (/^01\d{9}$/.test(digits)) return `+88${digits}`;
  if (/^1\d{9}$/.test(digits)) return `+880${digits}`;
  if (/^8801\d{9}$/.test(digits)) return `+${digits}`;
  return null;
}

const byPhone = new Map();
for (const submission of submissions) {
  const rawContact = String(submission.row[phoneColumn] ?? '').trim();
  const key = phoneMatchKey(submission.row[phoneColumn]) ??
    (rawContact ? `raw:${rawContact}` : `missing-row-${submission.excelRow}`);
  if (!byPhone.has(key)) byPhone.set(key, []);
  byPhone.get(key).push(submission);
}

const duplicateGroups = [...byPhone.values()].filter((group) => group.length > 1);
const extraSubmissions = duplicateGroups.reduce((count, group) => count + group.length - 1, 0);
if (duplicateGroups.length !== 7 || extraSubmissions !== 7) {
  throw new Error('Duplicate phone groups have changed; review them before choosing submissions.');
}

console.log(`Repeated-submission groups: ${duplicateGroups.length}`);
for (const group of duplicateGroups) {
  const newest = group.toSorted((a, b) =>
    b.row[timestampColumn].getTime() - a.row[timestampColumn].getTime(),
  )[0];
  const ids = group.map(({ row }) => Number(row[idColumn]));
  if (ids.includes(738) && Number(newest.row[idColumn]) !== 238) {
    throw new Error('The FTC 238/738 selection changed.');
  }
  if (ids.includes(850) && Number(newest.row[idColumn]) !== 805) {
    throw new Error('The FTC 805/850 selection changed.');
  }
  console.log(`All rows ${group.map(({ excelRow }) => excelRow).join(', ')} → keep row ${newest.excelRow} (FTC ${newest.row[idColumn]})`);
}
const selected = [...byPhone.values()].map((group) => group.toSorted((a, b) =>
  b.row[timestampColumn].getTime() - a.row[timestampColumn].getTime(),
)[0]);
console.log(`Proposed distinct members: ${selected.length}`);

function normalizeBatch(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  if (typeof value === 'number') return Number.isInteger(value) && value > 0 ? value : undefined;
  const text = value.trim();
  if (/^(N\/A|4r)$/i.test(text)) return null;
  if (/^43MS$/i.test(text)) return 43;
  const match = text.match(/^(\d{2})\s*(?:(?:st|nd|rd|th)\s*)?(?:BCS|Batch)?$/i);
  return match ? Number(match[1]) : undefined;
}

const batchColumn = rows[0].indexOf('BCS Batch:');
if (batchColumn === -1) throw new Error('The BCS batch heading is missing.');
const unresolvedBatches = selected.filter(({ row }) => normalizeBatch(row[batchColumn]) === undefined);
const unknownBatches = selected.filter(({ row }) => normalizeBatch(row[batchColumn]) === null);
console.log(`BCS batch: ${selected.length - unresolvedBatches.length - unknownBatches.length} known, ${unknownBatches.length} unknown, ${unresolvedBatches.length} unresolved`);
for (const { row, excelRow } of unresolvedBatches) {
  console.log(`  All row ${excelRow}, FTC ${row[idColumn]}: ${String(row[batchColumn])}`);
}

for (const [label, column] of [
  ['WhatsApp contact', phoneColumn],
  ['Blood group', rows[0].indexOf('Blood Group:')],
]) {
  if (column === -1) throw new Error(`The ${label} heading is missing.`);
  const blank = selected.filter(({ row }) => !String(row[column] ?? '').trim());
  console.log(`${label}: ${selected.length - blank.length} provided as free text, ${blank.length} blank`);
  for (const { row, excelRow } of blank) {
    console.log(`  All row ${excelRow}, FTC ${row[idColumn]}: ${String(row[column])}`);
  }
}
