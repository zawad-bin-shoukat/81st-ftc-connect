import 'dotenv/config';
import assert from 'node:assert/strict';
import pg from 'pg';
import { randomBytes, createHash } from 'node:crypto';
import { readFile, readdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../dist/app.module.js';
import { RegistrationService } from '../dist/auth/registration.service.js';
import { PrismaService } from '../dist/database/prisma.service.js';

// All mutation tests use a brand-new disposable DB, never the imported roster.
const local = new URL(process.env.DATABASE_URL);
assert.equal(local.hostname, '127.0.0.1');
assert.equal(local.port, '55432');
assert.equal(local.pathname, '/ftc_connect');
const database = 'ftc_auth_test_' + randomBytes(6).toString('hex');
const adminUrl = new URL(local);
adminUrl.pathname = '/postgres';
const admin = new pg.Client({ connectionString: adminUrl.toString() });
const outbox = await mkdtemp(join(tmpdir(), 'ftc-otp-test-'));
let app,
  setup,
  created = false,
  checks = 0;
const hash = (value) => createHash('sha256').update(value).digest('hex');
function check(value, label) {
  assert.ok(value, label);
  checks++;
}
try {
  await admin.connect();
  await admin.query('CREATE DATABASE "' + database + '"');
  created = true;
  const testUrl = new URL(local);
  testUrl.pathname = '/' + database;
  setup = new pg.Client({ connectionString: testUrl.toString() });
  await setup.connect();
  for (const name of (await readdir('prisma/migrations'))
    .filter((name) => /^\d/.test(name))
    .sort()) {
    await setup.query(
      await readFile('prisma/migrations/' + name + '/migration.sql', 'utf8'),
    );
  }
  await setup.end();
  setup = null;
  process.env.DATABASE_URL = testUrl.toString();
  process.env.NODE_ENV = 'development';
  process.env.OTP_MODE = 'local';
  process.env.AUTH_OTP_SECRET = randomBytes(32).toString('hex');
  process.env.LOCAL_OTP_DIR = outbox;
  delete process.env.LOCAL_API_TOKEN;
  app = await NestFactory.create(AppModule, {
    logger: false,
    abortOnError: false,
  });
  await app.listen(0, '127.0.0.1');
  const base = await app.getUrl();
  const db = app.get(PrismaService);
  const cadre = await db.cadre.create({
    data: { name: 'Synthetic test cadre' },
  });
  async function member(ftcId) {
    return db.member.create({
      data: {
        ftcId,
        section: 'A',
        name: 'Synthetic member ' + ftcId,
        cadreId: cadre.id,
        bcsBatch: null,
        education: 'Degree',
        university: 'University',
        phone: 'Raw contact ' + ftcId,
        email: 'test@example.com',
        bloodGroup: ' A ',
        homeDistrict: 'District',
      },
    });
  }
  const first = await member(1),
    second = await member(2),
    third = await member(3);
  async function invite(person) {
    const code = randomBytes(32).toString('base64url');
    await db.claimInvite.create({
      data: {
        memberId: person.id,
        tokenHash: hash(code),
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    return code;
  }
  const inviteCode = await invite(first);
  async function call(method, path, body, token) {
    const response = await fetch(base + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return {
      status: response.status,
      data: response.status === 204 ? {} : await response.json(),
    };
  }
  const start = (phone, ftcId = 1, code = inviteCode) =>
    call('POST', '/auth/claim', { phone, ftcId, inviteCode: code });
  const readCode = async (id) =>
    JSON.parse(await readFile(join(outbox, id + '.json'), 'utf8')).code;
  const verify = (id, code) =>
    call('POST', '/auth/verify', { challengeId: id, code });
  const resetLimits = () => db.authRateLimit.deleteMany();

  check(
    (await call('GET', '/members')).status === 401,
    'Roster must require access.',
  );
  check(
    (await call('GET', '/me')).status === 401,
    'Own profile must require a session.',
  );
  const fake = await start('+12025550101', 1, 'invalid');
  check(
    fake.status === 200 && !('code' in fake.data),
    'Invalid invite must have a generic response.',
  );
  check(
    (await verify(fake.data.challengeId, '000000')).status === 401,
    'Invalid invite must never verify.',
  );
  await resetLimits();
  const challenge = await start('+12025550101');
  check(
    challenge.status === 200 && challenge.data.deliveryMode === 'local',
    'Claim challenge failed.',
  );
  check(
    !('code' in challenge.data) && !('token' in challenge.data),
    'Code or session leaked in start response.',
  );
  const id = challenge.data.challengeId,
    code = await readCode(id);
  // Check actual stored instants with pg, independently of Prisma's conversion.
  const clockCheck = new pg.Client({ connectionString: testUrl.toString() });
  await clockCheck.connect();
  try {
    await clockCheck.query("SET TIME ZONE 'Asia/Dhaka'");
    const {
      rows: [stored],
    } = await clockCheck.query(
      'SELECT expires_at>now() AS active, extract(epoch FROM (expires_at-now())) AS remaining FROM otp_challenges WHERE id=$1',
      [id],
    );
    check(
      stored.active &&
        Number(stored.remaining) > 240 &&
        Number(stored.remaining) <= 300,
      'A fresh code must remain valid for five minutes in non-UTC DB sessions.',
    );
  } finally {
    await clockCheck.end();
  }
  const wrong = code === '000000' ? '111111' : '000000';
  check((await verify(id, wrong)).status === 401, 'Wrong code accepted.');
  check(
    (await db.otpChallenge.findUnique({ where: { id } })).attempts === 1,
    'Wrong attempts must persist.',
  );
  const simultaneous = await Promise.all([verify(id, code), verify(id, code)]);
  check(
    simultaneous.filter((r) => r.status === 200).length === 1,
    'Code must be consumed only once under concurrency.',
  );
  const token = simultaneous.find((r) => r.status === 200).data.token;
  const account = await db.account.findUnique({
    where: { memberId: first.id },
  });
  check(
    account.verifiedAt === null && account.verificationMethod === 'local',
    'Local testing must not claim SMS verification.',
  );
  check(
    (await db.member.findUnique({ where: { id: first.id } }))
      .phoneVerifiedAt === null,
    'Roster contact was falsely marked verified.',
  );
  check(
    (await call('GET', '/me', undefined, token)).data.id === first.id,
    'Session not bound to its member.',
  );
  check(
    (await call('GET', '/members', undefined, token)).data.total === 3,
    'Session cannot read roster.',
  );
  check(
    (await call('PATCH', '/me', { id: second.id, name: 'Intruder' }, token))
      .status === 400,
    'Ownership override accepted.',
  );
  check(
    (await db.member.findUnique({ where: { id: second.id } })).name ===
      second.name,
    'Another member was modified.',
  );
  check(
    (await call('PATCH', '/me', { loginPhone: '+12025550999' }, token))
      .status === 400,
    'Login number changed through profile.',
  );
  check(
    (await call('PATCH', '/me', { email: 'bad..email@example.com' }, token))
      .status === 400,
    'Bad email accepted.',
  );
  check(
    (await call('PATCH', '/me', { phone: second.phone }, token)).status === 409,
    'Duplicate contact accepted.',
  );
  const updated = await call(
    'PATCH',
    '/me',
    {
      phone: ' Bengali ০১২ contact ',
      bloodGroup: 'A (unknown Rh)',
      bcsBatch: 43,
    },
    token,
  );
  check(
    updated.status === 200 && updated.data.phone === ' Bengali ০১২ contact ',
    'Free-text contact changed.',
  );
  check(
    updated.data.bloodGroup === 'A (unknown Rh)' &&
      updated.data.bcsBatch === 43,
    'Profile update did not persist.',
  );
  check(
    (await db.account.findUnique({ where: { id: account.id } })).loginPhone ===
      '+12025550101',
    'Profile update changed login identity.',
  );
  check(
    (await call('POST', '/auth/logout', {}, token)).status === 204,
    'Logout failed.',
  );
  check(
    (await call('GET', '/me', undefined, token)).status === 401,
    'Revoked token accepted.',
  );

  await resetLimits();
  const login = await call('POST', '/auth/login', { phone: '+12025550101' });
  check(
    (await call('POST', '/auth/login', { phone: '+12025550101' })).status ===
      429,
    'Resend cooldown missing.',
  );
  const loginCode = await readCode(login.data.challengeId);
  const signedIn = await verify(login.data.challengeId, loginCode);
  check(signedIn.status === 200, 'Returning phone login failed.');
  const loginToken = signedIn.data.token;
  await db.member.update({
    where: { id: first.id },
    data: { isActive: false },
  });
  check(
    (await call('GET', '/me', undefined, loginToken)).status === 401,
    'Inactive member session accepted.',
  );
  await db.member.update({ where: { id: first.id }, data: { isActive: true } });
  process.env.NODE_ENV = 'production';
  check(
    (await call('GET', '/me', undefined, loginToken)).status === 503,
    'Local session worked in production.',
  );
  check(
    (await call('POST', '/auth/login', { phone: '+12025550101' })).status ===
      503,
    'Local OTP worked in production.',
  );
  process.env.NODE_ENV = 'development';
  await db.authSession.update({
    where: { tokenHash: hash(loginToken) },
    data: { expiresAt: new Date(0) },
  });
  check(
    (await call('GET', '/me', undefined, loginToken)).status === 401,
    'Expired session accepted.',
  );

  await resetLimits();
  const unknown = await call('POST', '/auth/login', { phone: '+12025550999' });
  check(
    unknown.status === 200 &&
      Object.keys(unknown.data).sort().join() ===
        Object.keys(login.data).sort().join(),
    'Account existence exposed in response.',
  );
  check(
    (await verify(unknown.data.challengeId, '000000')).status === 401,
    'Unknown phone authenticated.',
  );
  const invite2 = await invite(second);
  const locked = await start('+12025550202', 2, invite2);
  const lockedCode = await readCode(locked.data.challengeId);
  for (let i = 0; i < 5; i++)
    await verify(
      locked.data.challengeId,
      lockedCode === '000000' ? '111111' : '000000',
    );
  check(
    (await verify(locked.data.challengeId, lockedCode)).status === 401,
    'Attempt limit bypassed.',
  );
  await resetLimits();
  const expired = await start('+12025550202', 2, invite2);
  const expiredCode = await readCode(expired.data.challengeId);
  await db.otpChallenge.update({
    where: { id: expired.data.challengeId },
    data: { expiresAt: new Date(0) },
  });
  check(
    (await verify(expired.data.challengeId, expiredCode)).status === 401,
    'Expired code accepted.',
  );
  const invite3 = await invite(third);
  const a = await start('+12025550303', 3, invite3),
    b = await start('+12025550304', 3, invite3);
  const claims = await Promise.all([
    verify(a.data.challengeId, await readCode(a.data.challengeId)),
    verify(b.data.challengeId, await readCode(b.data.challengeId)),
  ]);
  check(
    claims.filter((r) => r.status === 200).length === 1,
    'An invite claimed two accounts.',
  );
  check(
    (await db.account.count({ where: { memberId: third.id } })) === 1,
    'Duplicate member accounts created.',
  );
  // Existing roster members enroll through phone OTP, without an invite.
  await resetLimits();
  const fourth = await member(4);
  await db.member.update({
    where: { id: fourth.id },
    data: { phone: '০১৭১২-৩৪৫৬৭৮' },
  });
  const direct = await call('POST', '/auth/login', { phone: '8801712345678' });
  check(direct.status === 200, 'Direct roster login did not start.');
  check(
    !(await db.account.findUnique({ where: { memberId: fourth.id } })),
    'Account created before OTP.',
  );
  const directCode = await readCode(direct.data.challengeId);
  const directResults = await Promise.all([
    verify(direct.data.challengeId, directCode),
    verify(direct.data.challengeId, directCode),
  ]);
  check(
    directResults.filter((r) => r.status === 200).length === 1,
    'Direct OTP enrolled more than once.',
  );
  const directToken = directResults.find((r) => r.status === 200).data.token;
  check(
    (await call('GET', '/me', undefined, directToken)).data.id === fourth.id,
    'Direct login linked wrong member.',
  );
  check(
    (await db.member.findUnique({ where: { id: fourth.id } })).phone ===
      '০১৭১২-৩৪৫৬৭৮',
    'Direct login changed raw contact.',
  );
  const fifth = await member(5),
    sixth = await member(6);
  await db.member.update({
    where: { id: fifth.id },
    data: { phone: '01812345678' },
  });
  await db.member.update({
    where: { id: sixth.id },
    data: { phone: '+8801812345678' },
  });
  await resetLimits();
  const ambiguous = await call('POST', '/auth/login', { phone: '01812345678' });
  check(
    !(
      await db.otpChallenge.findUnique({
        where: { id: ambiguous.data.challengeId },
      })
    ).memberId,
    'Ambiguous number matched a profile.',
  );
  check(
    (await verify(ambiguous.data.challengeId, '000000')).status === 401,
    'Ambiguous number authenticated.',
  );
  await db.member.update({
    where: { id: sixth.id },
    data: { phone: 'unusable contact' },
  });
  await resetLimits();
  const changed = await call('POST', '/auth/login', { phone: '01812345678' });
  const changedCode = await readCode(changed.data.challengeId);
  await db.member.update({
    where: { id: fifth.id },
    data: { phone: '01912345678' },
  });
  check(
    (await verify(changed.data.challengeId, changedCode)).status === 401,
    'Old contact challenge enrolled after contact changed.',
  );
  await db.member.update({
    where: { id: fifth.id },
    data: { isActive: false },
  });
  await resetLimits();
  const inactive = await call('POST', '/auth/login', { phone: '01912345678' });
  check(
    !(
      await db.otpChallenge.findUnique({
        where: { id: inactive.data.challengeId },
      })
    ).memberId,
    'Inactive roster member received code.',
  );

  await resetLimits();
  const requestedPhone = '+12025550808';
  const admission = await call('POST', '/auth/registration', {
    name: 'New synthetic member',
    ftcId: 808,
    phone: requestedPhone,
    evidence: 'Synthetic membership details',
  });
  check(admission.status === 202, 'Registration request failed.');
  check(
    !(await db.member.findUnique({ where: { ftcId: 808 } })),
    'Request created a member before approval.',
  );
  const pendingLogin = await call('POST', '/auth/login', {
    phone: requestedPhone,
  });
  check(
    !(
      await db.otpChallenge.findUnique({
        where: { id: pendingLogin.data.challengeId },
      })
    ).memberId,
    'Pending applicant got login access.',
  );
  check(
    (
      await call('POST', '/auth/registration', {
        name: 'New synthetic member',
        ftcId: 808,
        phone: requestedPhone,
        evidence: 'Again',
      })
    ).status === 202,
    'Duplicate request disclosed pending status.',
  );
  check(
    (await db.registrationRequest.count({ where: { ftcId: 808 } })) === 1,
    'Duplicate pending requests created.',
  );
  check(
    (
      await call('POST', '/auth/registration', {
        name: 'X',
        ftcId: 809,
        phone: '+12025550809',
        evidence: 'test',
        status: 'approved',
      })
    ).status === 400,
    'Applicant can set approval state.',
  );
  const pending = await db.registrationRequest.findFirst({
    where: { ftcId: 808 },
  });
  await new RegistrationService(db).approve(pending.id, {
    section: 'A',
    cadreId: cadre.id,
    education: 'Degree',
    university: 'University',
    email: 'new@example.com',
    bloodGroup: 'Unknown',
    homeDistrict: 'District',
    bcsBatch: null,
  });
  check(
    (await db.registrationRequest.findUnique({ where: { id: pending.id } }))
      .status === 'approved',
    'Admin approval not saved.',
  );
  await resetLimits();
  const approved = await call('POST', '/auth/login', { phone: requestedPhone });
  const approvedLogin = await verify(
    approved.data.challengeId,
    await readCode(approved.data.challengeId),
  );
  check(approvedLogin.status === 200, 'Approved member cannot log in.');
  check(
    (await call('GET', '/me', undefined, approvedLogin.data.token)).data
      .ftcId === 808,
    'Approved member linked to wrong profile.',
  );

  console.log(
    checks +
      ' authentication/integration checks passed in an isolated temporary database.',
  );
} finally {
  await app?.close();
  await setup?.end();
  if (created)
    await admin.query('DROP DATABASE "' + database + '" WITH (FORCE)');
  await admin.end();
  await rm(outbox, { recursive: true, force: true });
}
