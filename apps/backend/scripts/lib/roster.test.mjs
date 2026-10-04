import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  headings,
  normalizeBatch,
  normalizeCadre,
  normalizeDistrict,
  phoneMatchKey,
  prepareRoster,
} from './roster.mjs';

function fixture() {
  const ids = [
    238,
    805,
    211,
    736,
    940,
    1042,
    1241,
    1246,
    ...Array.from({ length: 545 }, (_, i) => 2000 + i),
  ];
  const records = ids.map((id, i) => ({
    timestamp: new Date('2026-01-01T00:00:00Z'),
    name: i === 0 ? 123 : 'Synthetic person',
    section: 'A',
    ftc_id: id,
    cadre: 'BCS (Administration)',
    bcs_batch: i === 0 ? '43MS' : i === 1 ? '4r' : '43rd',
    education: 'Degree',
    phone: 'synthetic-contact-' + i,
    university: 'University',
    blood_group: ' A (unknown Rh) ',
    email: [211, 736, 940, 1042, 1241, 1246].includes(id)
      ? 'fixture' + id + '@gmail'
      : 'fixture@example.com',
    home_district: 'Dhaka',
    about_me: '',
    favourite_quotation: 'A quote',
  }));
  for (const index of [0, 1, 8, 9, 10, 11, 12]) {
    records.push({
      ...records[index],
      timestamp: new Date('2026-01-02T00:00:00Z'),
      ftc_id: index === 0 ? 738 : index === 1 ? 850 : records[index].ftc_id,
    });
  }
  return [
    Object.values(headings).map((value) => ' ' + value + ' '),
    ...records.map((record) => Object.keys(headings).map((key) => record[key])),
    Array(14).fill(null),
  ];
}

test('selects approved IDs, latest repeats, fixes only approved emails, and preserves raw fields', () => {
  const plan = prepareRoster(fixture());
  assert.equal(plan.members.length, 553);
  assert.equal(plan.summary.blankRows, 1);
  assert.equal(plan.summary.emailCorrections.length, 6);
  assert.equal(plan.summary.duplicateSelections.length, 7);
  const first = plan.members.find((member) => member.ftc_id === 238);
  assert.equal(first.excelRow, 2);
  assert.equal(first.name, '123');
  assert.equal(first.blood_group, ' A (unknown Rh) ');
  assert.equal(first.bcs_batch, 43);
  assert.equal(first.cadre, 'Administration');
  assert.equal(
    plan.members.find((member) => member.ftc_id === 805).bcs_batch,
    null,
  );
  assert.ok(!plan.members.some((member) => [738, 850].includes(member.ftc_id)));
  assert.ok(
    plan.summary.duplicateSelections.find((item) => item.ftcId === 2000)
      .keptRow > 553,
  );
});

test('rejects changed counts, headings, corrections, and unresolved unique IDs', () => {
  assert.throws(() => prepareRoster(fixture().slice(0, -2)), /560/);
  const badHeader = fixture();
  badHeader[0][0] = 'Unknown';
  assert.throws(() => prepareRoster(badHeader), /heading/);
  const badEmail = fixture();
  badEmail[9][Object.keys(headings).indexOf('email')] = 'unapproved@gmail';
  assert.throws(() => prepareRoster(badEmail), /unapproved/);
  const duplicateId = fixture();
  duplicateId[16][Object.keys(headings).indexOf('ftc_id')] = 238;
  assert.throws(() => prepareRoster(duplicateId), /unique field/);
});

test('contact matching is separate from raw text; unresolved batches fail', () => {
  assert.equal(phoneMatchKey('০১৭১২৩৪৫৬৭৮'), '+8801712345678');
  assert.equal(phoneMatchKey(1.2345678901234568e20), null);
  assert.equal(normalizeBatch('N/A'), null);
  assert.equal(normalizeBatch('44TH BCS'), 44);
  assert.throws(() => normalizeBatch('surprise'), /Unrecognized/);
  assert.equal(normalizeCadre('BPATC'), 'BPATC');
  assert.equal(normalizeCadre('BSC Livestock'), 'BSC Livestock');
  assert.equal(normalizeDistrict('Dhaja'), 'Dhaka');
  assert.equal(normalizeDistrict('Cox\'sBazar'), "Cox's Bazar");
  assert.equal(normalizeDistrict('IRangpur '), 'Rangpur');
});
