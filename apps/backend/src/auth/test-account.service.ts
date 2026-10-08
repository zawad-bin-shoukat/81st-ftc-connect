import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service.js';
import { AUTH_SESSION_TTL_MS } from './auth.constants.js';
import { Prisma } from '../generated/prisma/client.js';
import {
  authConfig,
  codeDigest,
  digest,
  equalHash,
  loginPhone,
  objectBody,
  stringField,
} from './auth-input.js';
import { consumeRateLimit } from './auth-rate-limit.js';
import { LocalOtpDelivery } from './local-otp.delivery.js';
import { SmsBdDelivery } from './sms-bd.delivery.js';
import { profileInput } from '../members/profile-input.js';

export function testAccountConfig(): { testId: number; phone: string } | null {
  if (process.env.TEST_ADMIN_ENABLED !== 'true') return null;
  const testId = Number(process.env.TEST_ADMIN_ID);
  if (!Number.isInteger(testId) || testId < 1 || testId > 2147483647)
    return null;
  try {
    return { testId, phone: loginPhone(process.env.TEST_ADMIN_PHONE) };
  } catch {
    return null;
  }
}

export const initialTestProfile = {
  name: 'Test administrator',
  section: 'T',
  cadre: { id: 'test', name: 'Test profile' },
  bcsBatch: null,
  education: 'Test education',
  university: 'Test university',
  email: 'test@example.invalid',
  bloodGroup: 'Unknown',
  homeDistrict: 'Test district',
  aboutMe: 'Separate test profile. This is not a participant.',
  favouriteQuotation: null,
};

@Injectable()
export class TestAccountService {
  private readonly logger = new Logger(TestAccountService.name);
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(LocalOtpDelivery) private readonly localDelivery: LocalOtpDelivery,
    @Inject(SmsBdDelivery) private readonly smsDelivery: SmsBdDelivery,
  ) {}

  async allowed(id: string): Promise<boolean> {
    const config = testAccountConfig();
    if (!config) return false;
    const account = await this.db.testAccount.findUnique({ where: { id } });
    const { mode } = authConfig();
    return (
      !!account &&
      account.isActive &&
      account.testId === config.testId &&
      account.phone === config.phone &&
      account.verificationMethod === mode
    );
  }

  async start(body: unknown, peer: string) {
    const { mode } = authConfig();
    await consumeRateLimit(this.db, 'start-ip', peer, 30);
    const input = objectBody(body, ['phone', 'testId']);
    const phone = loginPhone(input.phone);
    if (
      typeof input.testId !== 'number' ||
      !Number.isInteger(input.testId) ||
      input.testId < 1 ||
      input.testId > 2147483647
    )
      throw new BadRequestException('Check test ID.');
    await consumeRateLimit(this.db, 'start-phone', phone, 5);
    await consumeRateLimit(this.db, 'cooldown-phone', phone, 1, 60);
    const config = testAccountConfig();
    const account =
      config?.phone === phone && config.testId === input.testId
        ? await this.db.testAccount.findUnique({
            where: { testId: config.testId },
          })
        : null;
    const eligible =
      account?.isActive &&
      account.phone === phone &&
      (mode === 'sms' ||
        !account.verificationMethod ||
        account.verificationMethod === 'local');
    const id = randomUUID();
    const code = String(randomInt(0, 1000000)).padStart(6, '0');
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    await this.db.$transaction(async (tx) => {
      await tx.$queryRawUnsafe(
        'SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext($1))',
        'test:' + phone,
      );
      await tx.testOtpChallenge.updateMany({
        where: { phone, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      await tx.testOtpChallenge.create({
        data: {
          id,
          phone,
          testAccountId: eligible ? account!.id : null,
          deliveryMode: mode,
          codeHash: codeDigest(id, code),
          expiresAt,
        },
      });
    });
    if (eligible) {
      try {
        if (mode === 'sms') await this.smsDelivery.deliver(phone, code);
        else await this.localDelivery.deliver(id, code, expiresAt);
      } catch {
        await this.db.testOtpChallenge.update({
          where: { id },
          data: { consumedAt: new Date() },
        });
        this.logger.error('Test OTP delivery failed; challenge invalidated.');
      }
    }
    return {
      challengeId: id,
      expiresAt,
      retryAfterSeconds: 60,
      deliveryMode: mode,
    };
  }

  async verify(body: unknown, peer: string) {
    const { mode } = authConfig();
    await consumeRateLimit(this.db, 'verify-ip', peer, 60);
    const input = objectBody(body, ['challengeId', 'code']);
    const id = stringField(input.challengeId, 'verification request', 36);
    const code = stringField(input.code, 'verification code', 6);
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        id,
      ) ||
      !/^\d{6}$/.test(code)
    )
      throw new BadRequestException('Enter the six-digit code.');
    const token = 'test_' + randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + AUTH_SESSION_TTL_MS);
    const testAccountId = await this.db.$transaction(async (tx) => {
      await tx.$queryRawUnsafe(
        'SELECT id FROM test_otp_challenges WHERE id=$1::uuid FOR UPDATE',
        id,
      );
      const challenge = await tx.testOtpChallenge.findUnique({
        where: { id },
        include: { testAccount: true },
      });
      if (
        !challenge ||
        challenge.deliveryMode !== mode ||
        challenge.consumedAt ||
        challenge.expiresAt <= new Date() ||
        challenge.attempts >= 5
      )
        return null;
      await tx.testOtpChallenge.update({
        where: { id },
        data: { attempts: { increment: 1 } },
      });
      const account = challenge.testAccount;
      const config = testAccountConfig();
      if (
        !equalHash(challenge.codeHash, codeDigest(id, code)) ||
        !account?.isActive ||
        !config ||
        account.testId !== config.testId ||
        account.phone !== config.phone ||
        account.phone !== challenge.phone ||
        (mode === 'local' && account.verificationMethod === 'sms')
      )
        return null;
      await tx.$queryRawUnsafe(
        'SELECT id FROM test_accounts WHERE id=$1::uuid FOR UPDATE',
        account.id,
      );
      // Recheck after obtaining the account lock.
      const current = await tx.testAccount.findUnique({
        where: { id: account.id },
      });
      if (
        !current?.isActive ||
        current.phone !== challenge.phone ||
        (mode === 'local' && current.verificationMethod === 'sms')
      )
        return null;
      if (current.verificationMethod !== mode) {
        await tx.testSession.updateMany({
          where: { testAccountId: account.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      await tx.testAccount.update({
        where: { id: account.id },
        data: {
          verificationMethod: mode,
          verifiedAt: mode === 'sms' ? new Date() : null,
        },
      });
      await tx.testOtpChallenge.update({
        where: { id },
        data: { consumedAt: new Date() },
      });
      await tx.testSession.create({
        data: {
          tokenHash: digest(token),
          testAccountId: account.id,
          expiresAt,
        },
      });
      return account.id;
    });
    if (!testAccountId)
      throw new UnauthorizedException(
        'Code is invalid, expired, or no longer usable.',
      );
    return { token, expiresAt, testAccountId, deliveryMode: mode };
  }

  async authenticate(authorization: string) {
    const tokenHash = digest(authorization.slice(7));
    const session = await this.db.testSession.findUnique({
      where: { tokenHash },
    });
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      !(await this.allowed(session.testAccountId))
    )
      throw new UnauthorizedException(
        'Your session has ended. Please sign in.',
      );
    const config = testAccountConfig()!;
    return {
      tokenHash,
      memberId: null,
      testAccountId: session.testAccountId,
      loginPhone: config.phone,
    };
  }

  async logout(tokenHash: string) {
    await this.db.testSession.updateMany({
      where: { tokenHash },
      data: { revokedAt: new Date() },
    });
  }

  async profile(id: string) {
    const account = await this.db.testAccount.findUniqueOrThrow({
      where: { id },
    });
    return {
      ...(account.profile as Record<string, unknown>),
      id: account.id,
      ftcId: account.testId,
      testId: account.testId,
      loginPhone: account.phone,
      isTestAccount: true,
      isAdministrator: true,
      authenticationMode: authConfig().mode,
    };
  }

  async updateOwn(id: string, body: unknown) {
    const values = profileInput(body);
    await this.db.$transaction(async (tx) => {
      await tx.$queryRawUnsafe(
        'SELECT id FROM test_accounts WHERE id=$1::uuid FOR UPDATE',
        id,
      );
      const account = await tx.testAccount.findUniqueOrThrow({ where: { id } });
      const profile = {
        ...(account.profile as Record<string, unknown>),
        ...values,
      };
      await tx.testAccount.update({
        where: { id },
        data: { profile: profile as Prisma.InputJsonObject },
      });
    });
    return this.profile(id);
  }
}
