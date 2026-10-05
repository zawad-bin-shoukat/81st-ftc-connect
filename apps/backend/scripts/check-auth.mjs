import 'dotenv/config';
import assert from 'node:assert/strict';
import pg from 'pg';
import { randomBytes, createHash } from 'node:crypto';
import { readFile, readdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../dist/app.module.js';
import { SmsBdDelivery } from '../dist/auth/sms-bd.delivery.js';
import { PrismaService } from '../dist/database/prisma.service.js';
import { PhotoStorageService } from '../dist/members/photo-storage.service.js';
import sharp from 'sharp';

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
  delete process.env.ADMIN_FTC_IDS;
  delete process.env.TEST_ADMIN_ENABLED;
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
        homeDistrict: 'Dhaka',
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
  if (
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_BUCKET &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY
  ) {
    const image = await sharp({
      create: {
        width: 32,
        height: 32,
        channels: 3,
        background: '#246824',
      },
    })
      .jpeg()
      .toBuffer();
    const form = new FormData();
    form.set('photo', new Blob([image], { type: 'image/jpeg' }), 'test.jpg');
    try {
      check(
        (
          await fetch(base + '/me/photo', {
            method: 'POST',
            body: form,
            signal: AbortSignal.timeout(30000),
          })
        ).status === 401,
        'Unauthenticated photo upload was accepted.',
      );
      const uploaded = await fetch(base + '/me/photo', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token },
        body: form,
        signal: AbortSignal.timeout(30000),
      });
      check(uploaded.status === 201, 'Synthetic photo upload failed.');
      const own = await call('GET', '/me', undefined, token);
      check(
        own.status === 200 && own.data.photoUrl?.startsWith('https://'),
        'Own profile did not return a private photo URL.',
      );
      const imageResponse = await fetch(own.data.photoUrl, {
        signal: AbortSignal.timeout(30000),
      });
      check(
        imageResponse.status === 200 &&
          (await imageResponse.arrayBuffer()).byteLength > 0,
        'Private photo URL could not load the synthetic image.',
      );
      const removed = await call('DELETE', '/me/photo', undefined, token);
      check(removed.status === 200, 'Synthetic photo removal failed.');
      check(
        (await call('GET', '/me', undefined, token)).data.photoUrl === null,
        'Removed photo still appears on the member profile.',
      );
    } finally {
      const stored = await db.member.findUnique({ where: { id: first.id } });
      if (stored?.profilePhotoKey) {
        await app.get(PhotoStorageService).remove(stored.profilePhotoKey);
      }
    }
  }
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
  // Review routes require a live member session AND server-configured authority.
  const protectedMembers = JSON.stringify(
    await db.member.findMany({ orderBy: { ftcId: 'asc' } }),
  );
  const adminProfile = {
    section: 'A',
    cadreId: cadre.id,
    education: 'Degree',
    university: 'University',
    email: 'new@example.com',
    bloodGroup: 'Unknown',
    homeDistrict: 'Dhaka',
    bcsBatch: null,
  };
  const approvalBody = {
    profile: adminProfile,
    reviewNote: 'Verified against synthetic authoritative roster.',
    membershipConfirmed: true,
  };
  check(
    (await call('GET', '/admin/registrations')).status === 401,
    'Anonymous caller read membership requests.',
  );
  check(
    (
      await call(
        'POST',
        `/admin/registrations/${pending.id}/approve`,
        approvalBody,
      )
    ).status === 401,
    'Anonymous caller approved a request.',
  );
  check(
    (await call('GET', '/admin/registrations', undefined, directToken))
      .status === 403,
    'Empty administrator config allowed access.',
  );
  process.env.ADMIN_FTC_IDS = '4,broken';
  check(
    (await call('GET', '/admin/registrations', undefined, directToken))
      .status === 403,
    'Malformed administrator config allowed access.',
  );
  process.env.ADMIN_FTC_IDS = '4';
  check(
    (await call('GET', '/me', undefined, directToken)).data.isAdministrator ===
      true,
    'Administrator capability absent from own profile.',
  );
  check(
    (
      await call(
        'GET',
        '/admin/registrations?status=pending',
        undefined,
        directToken,
      )
    ).data.items.some((r) => r.id === pending.id),
    'Pending queue missing request.',
  );
  check(
    (
      await call(
        'GET',
        '/admin/registrations?status=bad',
        undefined,
        directToken,
      )
    ).status === 400,
    'Invalid review status accepted.',
  );
  check(
    (await call('GET', '/admin/registrations?page=1.5', undefined, directToken))
      .status === 400,
    'Invalid review page accepted.',
  );
  check(
    (
      await call(
        'GET',
        '/admin/registrations/not-a-uuid',
        undefined,
        directToken,
      )
    ).status === 400,
    'Invalid request ID accepted.',
  );
  check(
    (
      await call(
        'GET',
        `/admin/registrations/${pending.id}`,
        undefined,
        directToken,
      )
    ).data.cadres.some((c) => c.id === cadre.id),
    'Review details omitted cadre options.',
  );
  check(
    (
      await call(
        'POST',
        `/admin/registrations/${pending.id}/approve`,
        { ...approvalBody, membershipConfirmed: false },
        directToken,
      )
    ).status === 400,
    'Approval without membership confirmation accepted.',
  );
  check(
    (
      await call(
        'POST',
        `/admin/registrations/${pending.id}/approve`,
        { ...approvalBody, reviewNote: ' ' },
        directToken,
      )
    ).status === 400,
    'Approval without review note accepted.',
  );
  check(
    (
      await call(
        'POST',
        `/admin/registrations/${pending.id}/approve`,
        { ...approvalBody, profile: { ...adminProfile, email: 'bad' } },
        directToken,
      )
    ).status === 400,
    'Invalid approved email accepted.',
  );
  check(
    (
      await call(
        'POST',
        `/admin/registrations/${pending.id}/approve`,
        {
          ...approvalBody,
          profile: {
            ...adminProfile,
            cadreId: '00000000-0000-0000-0000-000000000000',
          },
        },
        directToken,
      )
    ).status === 400,
    'Unknown cadre accepted.',
  );
  check(
    (
      await call(
        'POST',
        `/admin/registrations/${pending.id}/approve`,
        { ...approvalBody, reviewedByMemberId: second.id },
        directToken,
      )
    ).status === 400,
    'Client supplied review actor accepted.',
  );
  check(
    !(await db.member.findUnique({ where: { ftcId: 808 } })),
    'Failed validation added a roster record.',
  );
  const concurrentApprovals = await Promise.all(
    [1, 2].map(() =>
      call(
        'POST',
        `/admin/registrations/${pending.id}/approve`,
        approvalBody,
        directToken,
      ),
    ),
  );
  check(
    concurrentApprovals.filter((r) => r.status === 201).length === 1 &&
      concurrentApprovals.filter((r) => r.status === 409).length === 1,
    'Concurrent reviews did not produce one approval and one conflict: ' +
      JSON.stringify(concurrentApprovals),
  );
  check(
    (await db.account.count({ where: { loginPhone: requestedPhone } })) === 0,
    'Approval created an account without OTP.',
  );
  const reviewed = (
    await call(
      'GET',
      `/admin/registrations/${pending.id}`,
      undefined,
      directToken,
    )
  ).data.request;
  check(
    reviewed.reviewedBy.ftcId === 4 &&
      reviewed.reviewNote === approvalBody.reviewNote &&
      reviewed.reviewedAt,
    'Approval audit lost actor, note or time.',
  );
  check(
    (
      await call(
        'POST',
        `/admin/registrations/${pending.id}/reject`,
        { reviewNote: 'Too late' },
        directToken,
      )
    ).status === 409,
    'Approved request was rejected later.',
  );
  check(
    JSON.stringify(
      await db.member.findMany({
        where: { ftcId: { not: 808 } },
        orderBy: { ftcId: 'asc' },
      }),
    ) === protectedMembers,
    'Review changed an existing participant.',
  );
  const rejected = await db.registrationRequest.create({
    data: {
      name: 'Rejected synthetic applicant',
      ftcId: 809,
      phone: '+12025550809',
      evidence: 'Synthetic',
    },
  });
  check(
    (
      await call(
        'POST',
        `/admin/registrations/${rejected.id}/reject`,
        { reviewNote: '' },
        directToken,
      )
    ).status === 400,
    'Blank rejection reason accepted.',
  );
  check(
    (
      await call(
        'POST',
        `/admin/registrations/${rejected.id}/reject`,
        { reviewNote: 'Membership could not be confirmed.' },
        directToken,
      )
    ).status === 201,
    'Rejection failed.',
  );
  check(
    !(await db.member.findUnique({ where: { ftcId: 809 } })),
    'Rejection created a member.',
  );
  check(
    (
      await call(
        'POST',
        `/admin/registrations/${rejected.id}/approve`,
        approvalBody,
        directToken,
      )
    ).status === 409,
    'Rejected request was approved later.',
  );
  check(
    (
      await call(
        'GET',
        '/admin/registrations?status=rejected',
        undefined,
        directToken,
      )
    ).data.items.some((r) => r.id === rejected.id),
    'Rejected request missing from history.',
  );
  const conflict = await db.registrationRequest.create({
    data: {
      name: 'Duplicate synthetic identity',
      ftcId: 810,
      phone: '+8801712345678',
      evidence: 'Synthetic',
    },
  });
  check(
    (
      await call(
        'POST',
        `/admin/registrations/${conflict.id}/approve`,
        approvalBody,
        directToken,
      )
    ).status === 409,
    'Canonical phone conflict approved.',
  );
  check(
    (await db.registrationRequest.findUnique({ where: { id: conflict.id } }))
      .status === 'pending',
    'Conflicted approval changed status.',
  );
  delete process.env.ADMIN_FTC_IDS;
  check(
    (
      await call(
        'POST',
        `/admin/registrations/${conflict.id}/reject`,
        { reviewNote: 'Synthetic' },
        directToken,
      )
    ).status === 403,
    'Revoked administrator still reviewed requests.',
  );
  process.env.ADMIN_FTC_IDS = '4';
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

  check(
    (
      await call(
        'GET',
        '/admin/registrations',
        undefined,
        approvedLogin.data.token,
      )
    ).status === 403,
    'Ordinary member read private requests.',
  );
  check(
    (
      await call(
        'POST',
        `/admin/registrations/${conflict.id}/approve`,
        approvalBody,
        approvedLogin.data.token,
      )
    ).status === 403,
    'Ordinary member approved a request.',
  );
  check(
    (
      await call(
        'POST',
        `/admin/registrations/${conflict.id}/reject`,
        { reviewNote: 'Attack' },
        approvedLogin.data.token,
      )
    ).status === 403,
    'Ordinary member rejected a request.',
  );
  check(
    (
      await call(
        'PATCH',
        '/me',
        { isAdministrator: true },
        approvedLogin.data.token,
      )
    ).status === 400,
    'Member promoted themselves to administrator.',
  );
  check(
    (await call('GET', '/me', undefined, approvedLogin.data.token)).data
      .isAdministrator === false,
    'Ordinary profile advertised administrator capability.',
  );
  await db.member.update({
    where: { id: fourth.id },
    data: { isActive: false },
  });
  check(
    (await call('GET', '/admin/registrations', undefined, directToken))
      .status === 401,
    'Inactive administrator kept access.',
  );
  await db.member.update({
    where: { id: fourth.id },
    data: { isActive: true },
  });

  // Exercise SMS mode without contacting the provider or changing real members.
  await resetLimits();
  const localBeforeSms = await call('POST', '/auth/login', {
    phone: '+12025550101',
  });
  const localSession = await verify(
    localBeforeSms.data.challengeId,
    await readCode(localBeforeSms.data.challengeId),
  );
  check(localSession.status === 200, 'Local session setup failed.');
  await resetLimits();
  const oldLocal = await call('POST', '/auth/login', { phone: '+12025550101' });
  const oldLocalCode = await readCode(oldLocal.data.challengeId);
  process.env.OTP_MODE = 'sms';
  process.env.SMS_BD_API_KEY = 'synthetic-test-key';
  const originalFetch = globalThis.fetch;
  const provider = new SmsBdDelivery();
  let providerPayload;
  try {
    globalThis.fetch = async (url, options) => {
      providerPayload = { url, ...options };
      return new Response(
        JSON.stringify({ error: 0, data: { request_id: 1 } }),
        {
          status: 200,
        },
      );
    };
    await provider.deliver('+8801712345678', '123456');
    check(
      providerPayload.url === 'https://api.sms.net.bd/sendsms' &&
        providerPayload.method === 'POST' &&
        JSON.parse(providerPayload.body).to === '8801712345678' &&
        JSON.parse(providerPayload.body).api_key === 'synthetic-test-key' &&
        JSON.parse(providerPayload.body).msg.includes('123456'),
      'SMS provider request is incorrect.',
    );
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({ error: 417, msg: 'Insufficient balance' }),
        {
          status: 200,
        },
      );
    await assert.rejects(provider.deliver('+8801712345678', '123456'));
    checks++;
  } finally {
    globalThis.fetch = originalFetch;
  }
  check(
    (await verify(oldLocal.data.challengeId, oldLocalCode)).status === 401,
    'A local code worked after switching to SMS mode.',
  );
  const sent = new Map();
  app.get(SmsBdDelivery).deliver = async (phone, code) => sent.set(phone, code);
  await resetLimits();
  const smsStart = await call('POST', '/auth/login', { phone: '+12025550101' });
  check(
    smsStart.status === 200 && smsStart.data.deliveryMode === 'sms',
    'SMS mode did not start.',
  );
  check(sent.has('+12025550101'), 'Eligible account did not receive SMS.');
  const smsLogin = await verify(
    smsStart.data.challengeId,
    sent.get('+12025550101'),
  );
  check(smsLogin.status === 200, 'SMS challenge did not verify.');
  const upgraded = await db.account.findUnique({
    where: { memberId: first.id },
  });
  check(
    upgraded.verificationMethod === 'sms' && upgraded.verifiedAt !== null,
    'Local account was not reverified through SMS.',
  );
  check(
    (await call('GET', '/me', undefined, localSession.data.token)).status ===
      401,
    'Old local session survived SMS verification.',
  );
  check(
    (await call('GET', '/me', undefined, smsLogin.data.token)).status === 200,
    'SMS session cannot read its profile.',
  );
  process.env.NODE_ENV = 'production';
  check(
    (await call('GET', '/me', undefined, smsLogin.data.token)).status === 200,
    'SMS session was disabled in production mode.',
  );
  process.env.NODE_ENV = 'development';
  process.env.OTP_MODE = 'local';
  check(
    (await call('GET', '/me', undefined, smsLogin.data.token)).status === 401,
    'SMS session worked in local-only mode.',
  );
  process.env.OTP_MODE = 'sms';
  const seventh = await member(7);
  await db.member.update({
    where: { id: seventh.id },
    data: { phone: '01712345000' },
  });
  await resetLimits();
  const directSms = await call('POST', '/auth/login', { phone: '01712345000' });
  check(
    directSms.data.deliveryMode === 'sms' && sent.has('+8801712345000'),
    'Direct roster SMS was not sent.',
  );
  const directSmsLogin = await verify(
    directSms.data.challengeId,
    sent.get('+8801712345000'),
  );
  check(directSmsLogin.status === 200, 'Direct roster SMS did not verify.');
  check(
    (await db.member.findUnique({ where: { id: seventh.id } }))
      .phoneVerifiedAt !== null,
    'Verified roster contact was not marked verified.',
  );
  await call(
    'PATCH',
    '/me',
    { phone: 'Another display contact' },
    directSmsLogin.data.token,
  );
  check(
    (await db.member.findUnique({ where: { id: seventh.id } }))
      .phoneVerifiedAt === null,
    'Changing the display contact retained its old verification.',
  );
  await resetLimits();
  const noSms = await call('POST', '/auth/login', { phone: '+12025550999' });
  check(
    noSms.data.deliveryMode === 'sms' && !sent.has('+12025550999'),
    'Unknown phone received an SMS.',
  );
  const eighth = await member(8);
  await db.member.update({
    where: { id: eighth.id },
    data: { phone: '01912345000' },
  });
  app.get(SmsBdDelivery).deliver = async () => {
    throw new Error('Synthetic provider failure');
  };
  await resetLimits();
  check(
    (await call('POST', '/auth/login', { phone: '01912345000' })).status ===
      200,
    'Provider failure disclosed an eligible phone.',
  );
  check(
    (
      await db.otpChallenge.findFirst({
        where: { phone: '+8801912345000' },
      })
    ).consumedAt !== null,
    'Failed delivery left a usable challenge.',
  );

  // Separate staff identity shares a phone with a participant without sharing ownership.
  const protectedRoster = JSON.stringify(
    await db.member.findMany({ orderBy: { id: 'asc' } }),
  );
  const protectedAccounts = JSON.stringify(
    await db.account.findMany({ orderBy: { id: 'asc' } }),
  );
  const rosterTotal = await db.member.count({ where: { isActive: true } });
  process.env.TEST_ADMIN_ENABLED = 'true';
  process.env.TEST_ADMIN_ID = '1000';
  process.env.TEST_ADMIN_PHONE = '+8801712345678';
  process.env.OTP_MODE = 'local';
  const staff = await db.testAccount.create({
    data: {
      testId: 1000,
      phone: '+8801712345678',
      profile: {
        name: 'Test administrator',
        section: 'T',
        cadre: { id: 'test', name: 'Test' },
        bcsBatch: null,
        education: 'Test',
        university: 'Test',
        email: 'test@example.invalid',
        bloodGroup: 'Unknown',
        homeDistrict: 'Test district',
        phone: 'Test contact',
        aboutMe: null,
        favouriteQuotation: null,
      },
    },
  });
  const staffStart = (testId = 1000) =>
    call('POST', '/auth/test/login', { testId, phone: '01712345678' });
  const staffVerify = (challengeId, code) =>
    call('POST', '/auth/test/verify', { challengeId, code });
  await resetLimits();
  const wrongStaff = await staffStart(999);
  check(
    wrongStaff.status === 200 && !('code' in wrongStaff.data),
    'Unknown test identity disclosed eligibility.',
  );
  check(
    (await staffVerify(wrongStaff.data.challengeId, '000000')).status === 401,
    'Unknown test identity verified.',
  );
  await resetLimits();
  const staffLogin = await staffStart();
  const staffCode = await readCode(staffLogin.data.challengeId);
  check(
    (await call('POST', '/auth/login', { phone: '01712345678' })).status ===
      429,
    'Separate login bypassed shared phone cooldown.',
  );
  check(
    (await verify(staffLogin.data.challengeId, staffCode)).status === 401,
    'Test challenge accepted on participant route.',
  );
  check(
    (await staffVerify(oldLocal.data.challengeId, oldLocalCode)).status === 401,
    'Participant challenge accepted on test route.',
  );
  const staffWrong = staffCode === '000000' ? '111111' : '000000';
  check(
    (await staffVerify(staffLogin.data.challengeId, staffWrong)).status === 401,
    'Wrong test OTP accepted.',
  );
  check(
    (
      await db.testOtpChallenge.findUnique({
        where: { id: staffLogin.data.challengeId },
      })
    ).attempts === 1,
    'Test OTP attempt not persisted.',
  );
  const staffConcurrent = await Promise.all([
    staffVerify(staffLogin.data.challengeId, staffCode),
    staffVerify(staffLogin.data.challengeId, staffCode),
  ]);
  check(
    staffConcurrent.filter((r) => r.status === 200).length === 1,
    'Test OTP replay created multiple sessions.',
  );
  const staffToken = staffConcurrent.find((r) => r.status === 200).data.token;
  check(staffToken.startsWith('test_'), 'Test token lacks separate namespace.');
  const staffMe = await call('GET', '/me', undefined, staffToken);
  check(
    staffMe.status === 200 &&
      staffMe.data.testId === 1000 &&
      staffMe.data.id === staff.id &&
      staffMe.data.isTestAccount &&
      staffMe.data.isAdministrator,
    'Test session acted as participant.',
  );
  check(
    (await call('GET', '/members', undefined, staffToken)).data.total ===
      rosterTotal,
    'Test identity changed directory count.',
  );
  check(
    (await call('GET', '/members/' + staff.id, undefined, staffToken))
      .status === 404,
    'Test identity appeared in participant directory.',
  );
  check(
    (
      await call(
        'PATCH',
        '/me',
        {
          name: 'My private test profile',
          phone: 'Test display contact',
          bloodGroup: 'Test group',
        },
        staffToken,
      )
    ).status === 200,
    'Separate profile edit failed.',
  );
  check(
    (await db.testAccount.findUnique({ where: { id: staff.id } })).profile
      .name === 'My private test profile',
    'Separate profile edit did not persist.',
  );
  check(
    (
      await call(
        'PATCH',
        '/me',
        { ftcId: 4, loginPhone: '+8801812345678' },
        staffToken,
      )
    ).status === 400,
    'Test profile reassigned identity.',
  );
  check(
    (await call('GET', '/admin/registrations', undefined, staffToken))
      .status === 200,
    'Separate test administrator cannot review.',
  );
  const staffRequest = await db.registrationRequest.create({
    data: {
      name: 'Synthetic staff review',
      ftcId: 900,
      phone: '+8801998765432',
      evidence: 'Synthetic',
    },
  });
  check(
    (
      await call(
        'POST',
        '/admin/registrations/' + staffRequest.id + '/reject',
        { reviewNote: 'Synthetic review only' },
        staffToken,
      )
    ).status === 201,
    'Test administrator rejection failed.',
  );
  const staffReview = (
    await call(
      'GET',
      '/admin/registrations/' + staffRequest.id,
      undefined,
      staffToken,
    )
  ).data.request;
  check(
    staffReview.reviewedByTestAccount.testId === 1000 &&
      staffReview.reviewedBy === null,
    'Test administrator audit impersonated a participant.',
  );
  await resetLimits();
  const staleStaff = await staffStart();
  const staleStaffCode = await readCode(staleStaff.data.challengeId);
  await resetLimits();
  const replacementStaff = await staffStart();
  const replacementCode = await readCode(replacementStaff.data.challengeId);
  check(
    (await staffVerify(staleStaff.data.challengeId, staleStaffCode)).status ===
      401,
    'Resent test OTP left older code active.',
  );
  await db.testOtpChallenge.update({
    where: { id: replacementStaff.data.challengeId },
    data: { expiresAt: new Date(0) },
  });
  check(
    (await staffVerify(replacementStaff.data.challengeId, replacementCode))
      .status === 401,
    'Expired test OTP accepted.',
  );
  await resetLimits();
  const lockedStaff = await staffStart();
  const lockedStaffCode = await readCode(lockedStaff.data.challengeId);
  for (let i = 0; i < 5; i++)
    await staffVerify(
      lockedStaff.data.challengeId,
      lockedStaffCode === '000000' ? '111111' : '000000',
    );
  check(
    (await staffVerify(lockedStaff.data.challengeId, lockedStaffCode))
      .status === 401,
    'Test OTP attempt limit bypassed.',
  );
  process.env.TEST_ADMIN_ENABLED = 'false';
  check(
    (await call('GET', '/me', undefined, staffToken)).status === 401,
    'Disabled test identity kept access.',
  );
  process.env.TEST_ADMIN_ENABLED = 'true';
  await db.testAccount.update({
    where: { id: staff.id },
    data: { isActive: false },
  });
  check(
    (await call('GET', '/admin/registrations', undefined, staffToken))
      .status === 401,
    'Inactive test administrator kept access.',
  );
  await db.testAccount.update({
    where: { id: staff.id },
    data: { isActive: true },
  });
  await resetLimits();
  const beforeSmsStaff = await staffStart();
  const beforeSmsStaffCode = await readCode(beforeSmsStaff.data.challengeId);
  process.env.OTP_MODE = 'sms';
  app.get(SmsBdDelivery).deliver = async (phone, code) => sent.set(phone, code);
  check(
    (await staffVerify(beforeSmsStaff.data.challengeId, beforeSmsStaffCode))
      .status === 401,
    'Local test OTP worked in SMS mode.',
  );
  await resetLimits();
  const smsStaff = await staffStart();
  const smsStaffResult = await staffVerify(
    smsStaff.data.challengeId,
    sent.get('+8801712345678'),
  );
  check(
    smsStaffResult.status === 200 && smsStaffResult.data.deliveryMode === 'sms',
    'Separate SMS verification failed.',
  );
  check(
    (await call('GET', '/me', undefined, staffToken)).status === 401,
    'Local test session survived SMS upgrade.',
  );
  process.env.NODE_ENV = 'production';
  check(
    (
      await call(
        'GET',
        '/admin/registrations',
        undefined,
        smsStaffResult.data.token,
      )
    ).status === 200,
    'SMS test administrator unavailable in production.',
  );
  process.env.NODE_ENV = 'development';
  check(
    (await call('POST', '/auth/logout', {}, smsStaffResult.data.token))
      .status === 204,
    'Test sign-out failed.',
  );
  check(
    (await call('GET', '/me', undefined, smsStaffResult.data.token)).status ===
      401,
    'Test session survived sign-out.',
  );
  check(
    JSON.stringify(await db.member.findMany({ orderBy: { id: 'asc' } })) ===
      protectedRoster,
    'Separate staff flow changed real participant profiles.',
  );
  check(
    JSON.stringify(await db.account.findMany({ orderBy: { id: 'asc' } })) ===
      protectedAccounts,
    'Separate staff flow changed real participant accounts.',
  );

  // Deletion checks operate only on new synthetic rows in this disposable DB.
  const deletingMember = await member(9000);
  const deletingAccount = await db.account.create({
    data: {
      memberId: deletingMember.id,
      loginPhone: '+8801700009000',
      verificationMethod: 'sms',
      verifiedAt: new Date(),
    },
  });
  const deletingToken = randomBytes(32).toString('base64url');
  await db.authSession.create({
    data: {
      tokenHash: hash(deletingToken),
      accountId: deletingAccount.id,
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  const reviewedRequest = await db.registrationRequest.create({
    data: {
      ftcId: 9001,
      name: 'Other applicant',
      phone: '+8801700009001',
      evidence: 'Synthetic',
      reviewedByMemberId: deletingMember.id,
    },
  });
  await db.registrationRequest.create({
    data: {
      ftcId: 9000,
      name: 'Deleting applicant',
      phone: '+8801700009000',
      evidence: 'Synthetic',
      status: 'approved',
    },
  });
  const unrelatedRequest = await db.registrationRequest.create({
    data: {
      ftcId: 9000,
      name: 'Unrelated applicant',
      phone: '+8801700009999',
      evidence: 'Synthetic',
    },
  });
  check(
    (await call('DELETE', '/me', {}, deletingToken)).status === 400,
    'Member deletion did not require explicit confirmation.',
  );
  check(
    (await call('DELETE', '/me', { confirm: 'DELETE' }, deletingToken))
      .status === 200,
    'Member self-deletion failed.',
  );
  check(
    !(await db.member.findUnique({ where: { id: deletingMember.id } })) &&
      !(await db.account.findUnique({ where: { id: deletingAccount.id } })) &&
      !(await db.authSession.findUnique({
        where: { tokenHash: hash(deletingToken) },
      })),
    'Deleted member retained profile, account, or session.',
  );
  check(
    (await call('GET', '/me', undefined, deletingToken)).status === 401,
    'Deleted member session retained access.',
  );
  check(
    !(await db.registrationRequest.findFirst({
      where: { ftcId: 9000, phone: '+8801700009000' },
    })) &&
      !!(await db.registrationRequest.findUnique({
        where: { id: unrelatedRequest.id },
      })) &&
      (
        await db.registrationRequest.findUnique({
          where: { id: reviewedRequest.id },
        })
      ).reviewedByMemberId === null,
    'Member deletion left an applicant submission or reviewer link.',
  );

  const deletingStaffToken = 'test_' + randomBytes(32).toString('base64url');
  await db.testSession.create({
    data: {
      tokenHash: hash(deletingStaffToken),
      testAccountId: staff.id,
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  check(
    (await call('DELETE', '/me', { confirm: 'DELETE' }, deletingStaffToken))
      .status === 200,
    'Test account self-deletion failed.',
  );
  check(
    !(await db.testAccount.findUnique({ where: { id: staff.id } })) &&
      (await call('GET', '/me', undefined, deletingStaffToken)).status === 401,
    'Deleted test account retained access.',
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
