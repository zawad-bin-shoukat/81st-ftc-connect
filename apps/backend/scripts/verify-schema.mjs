import 'dotenv/config';
import assert from 'node:assert/strict';
import pg from 'pg';

// Synthetic rows are always rolled back. Run only against our local project DB.
const url = new URL(process.env.DATABASE_URL);
assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.port, '55432');
assert.equal(url.pathname, '/ftc_connect');
const client = new pg.Client({ connectionString: url.toString() });
await client.connect();
let passed = 0;
async function rejects(sql, values, code, constraint, column) {
  await client.query('SAVEPOINT check_constraint');
  try {
    await client.query(sql, values);
    assert.fail(`Expected rejection: ${constraint}`);
  } catch (error) {
    assert.equal(error.code, code, constraint);
    if (Array.isArray(constraint)) {
      assert.ok(constraint.includes(error.constraint));
    } else if (constraint !== undefined) {
      assert.equal(error.constraint, constraint);
    }
    if (column !== undefined) {
      assert.equal(error.column, column);
    }
    passed++;
  } finally {
    await client.query('ROLLBACK TO SAVEPOINT check_constraint');
  }
}
try {
  await client.query('BEGIN');
  const { rows: [cadre] } = await client.query(
    'INSERT INTO cadres (name) VALUES ($1) RETURNING id', ['Schema verification only'],
  );
  const insert = `
    INSERT INTO members (
      ftc_id, section, name, cadre_id, bcs_batch, phone,
      education, university, email, blood_group, home_district
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING *
  `;

  const values = [
    2147483646,
    'A',
    'Synthetic verification member',
    cadre.id,
    43,
    '+12025550101',
    'BSc',
    'Example University',
    'schema.test@example.com',
    'B+',
    'Dhaka',
  ];
  const { rows: [member] } = await client.query(insert, values);
  assert.match(member.id, /^[0-9a-f-]{36}$/);
  assert.equal(member.is_active, true);
  assert.equal(member.phone_verified_at, null);
  assert.equal(member.education, 'BSc');
  assert.equal(member.university, 'Example University');
  assert.equal(member.email, 'schema.test@example.com');
  assert.equal(member.blood_group, 'B+');
  assert.equal(member.home_district, 'Dhaka');
  assert.ok(member.created_at instanceof Date);
  assert.ok(member.updated_at instanceof Date);
  passed++;
  await rejects(
    insert,
    [...values.slice(0, 5), '+12025550102', ...values.slice(6)],
    '23505',
    'members_ftc_id_key',
  );
  await rejects(insert, [2147483645, ...values.slice(1)], '23505', 'members_phone_key');
  await rejects('INSERT INTO cadres (name) VALUES ($1)', ['Schema verification only'], '23505', 'cadres_name_key');
  await rejects('DELETE FROM cadres WHERE id = $1', [cadre.id], '23503', 'members_cadre_id_fkey');
  await rejects('UPDATE members SET cadre_id = $1 WHERE id = $2', ['00000000-0000-0000-0000-000000000000', member.id], '23503', 'members_cadre_id_fkey');
  await rejects('UPDATE members SET phone = $1 WHERE id = $2', ['01700000000', member.id], '23514', 'members_phone_e164');
  await rejects('UPDATE members SET blood_group = $1 WHERE id = $2', ['X+', member.id], '23514', 'members_blood_group_valid');
  await rejects('UPDATE members SET bcs_batch = 0 WHERE id = $1', [member.id], '23514', 'members_batch_positive');
  await rejects('UPDATE members SET ftc_id = 0 WHERE id = $1', [member.id], '23514', 'members_ftc_id_positive');
  await rejects('UPDATE members SET name = $1 WHERE id = $2', [' ', member.id], '23514', 'members_name_not_blank');
  await rejects('UPDATE members SET section = $1 WHERE id = $2', [' ', member.id], '23514', 'members_section_not_blank');
  for (const blood of ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']) {
    await client.query('UPDATE members SET blood_group = $1 WHERE id = $2', [blood, member.id]);
  }
  passed++;
  // Malformed email addresses must be rejected.
  const invalidEmails = [
    'not-an-email',
    'person@',
    '@example.com',
    'person@example',
    'first..last@example.com',
    'person name@example.com',
    'person@-example.com',
    'person@example..com',
    `${'a'.repeat(65)}@example.com`,
  ];

  for (const email of invalidEmails) {
    await rejects(
      'UPDATE members SET email = $1 WHERE id = $2',
      [email, member.id],
      '23514',
      'members_email_format',
    );
  }

  // Common valid email formats must be accepted.
  const validEmails = [
    'person@example.com',
    'first.last@example.org',
    'person+work@example.com',
  ];

  for (const email of validEmails) {
    await client.query(
      'UPDATE members SET email = $1 WHERE id = $2',
      [email, member.id],
    );
    passed++;
  }
  const requiredFields = [
    'education',
    'university',
    'email',
    'blood_group',
    'home_district',
  ];

  for (const field of requiredFields) {
    await rejects(
      `UPDATE members SET "${field}" = NULL WHERE id = $1`,
      [member.id],
      '23502',
      undefined,
      field,
    );
  }

  const blankFields = [
    ['education', 'members_education_not_blank'],
    ['university', 'members_university_not_blank'],
    ['home_district', 'members_home_district_not_blank'],
  ];

  for (const [field, constraint] of blankFields) {
    await rejects(
      `UPDATE members SET "${field}" = $1 WHERE id = $2`,
      ['   ', member.id],
      '23514',
      constraint,
    );
  }

  await rejects(
    'UPDATE members SET email = $1 WHERE id = $2',
    ['   ', member.id],
    '23514',
    ['members_email_not_blank', 'members_email_format'],
  );
  await client.query(
    'UPDATE members SET bcs_batch = NULL WHERE id = $1',
    [member.id],
  );
  const { rows: [unknownBatch] } = await client.query(
    'SELECT bcs_batch FROM members WHERE id = $1',
    [member.id],
  );
  assert.equal(unknownBatch.bcs_batch, null);
  passed++;
  console.log(`${passed} schema checks passed. All synthetic rows will be rolled back.`);
} finally {
  await client.query('ROLLBACK');
  await client.end();
}
