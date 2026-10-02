import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import {
  codeDigest,
  digest,
  equalHash,
  authConfig,
  loginPhone,
  rosterPhone,
  objectBody,
  stringField,
} from './auth-input.js';
import { LocalOtpDelivery } from './local-otp.delivery.js';
import { SmsBdDelivery } from './sms-bd.delivery.js';
import { TestAccountService } from './test-account.service.js';
import { consumeRateLimit } from './auth-rate-limit.js';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(LocalOtpDelivery) private readonly localDelivery: LocalOtpDelivery,
    @Inject(SmsBdDelivery) private readonly smsDelivery: SmsBdDelivery,
    @Inject(TestAccountService)
    private readonly testAccounts: TestAccountService,
  ) {}

  // Count all matching contacts, including inactive/claimed records: never guess.
  private async rosterMatch(db: Prisma.TransactionClient, phone: string) {
    const rows = await db.member.findMany({
      select: {
        id: true,
        phone: true,
        isActive: true,
        account: { select: { id: true } },
      },
    });
    const matches = rows.filter((row) => rosterPhone(row.phone) === phone);
    const member = matches.length === 1 ? matches[0] : null;
    return member?.isActive && !member.account ? member.id : null;
  }

  async throttle(
    scope: string,
    identity: string,
    maximum: number,
    seconds = 900,
  ) {
    return consumeRateLimit(this.prisma, scope, identity, maximum, seconds);
  }

  async start(body: unknown, purpose: 'claim' | 'login', peer: string) {
    const { mode } = authConfig();
    await this.throttle('start-ip', peer, 30);
    const input = objectBody(
      body,
      purpose === 'claim' ? ['phone', 'ftcId', 'inviteCode'] : ['phone'],
    );
    const phone = loginPhone(input.phone);
    await this.throttle('start-phone', phone, 5);
    await this.throttle('cooldown-phone', phone, 1, 60);
    let memberId: string | null = null;
    let inviteId: string | null = null;
    if (purpose === 'claim') {
      const ftcId = Number(input.ftcId);
      if (!Number.isSafeInteger(ftcId) || ftcId < 1 || ftcId > 2147483647)
        throw new BadRequestException('Check FTC ID.');
      const token = stringField(input.inviteCode, 'invite code', 100);
      const invite = await this.prisma.claimInvite.findUnique({
        where: { tokenHash: digest(token) },
        include: { member: { include: { account: true } } },
      });
      const usedPhone = await this.prisma.account.findUnique({
        where: { loginPhone: phone },
      });
      if (
        invite &&
        invite.member.ftcId === ftcId &&
        invite.member.isActive &&
        !invite.member.account &&
        !usedPhone &&
        !invite.consumedAt &&
        !invite.revokedAt &&
        invite.expiresAt > new Date()
      ) {
        memberId = invite.memberId;
        inviteId = invite.id;
      }
    } else {
      const account = await this.prisma.account.findUnique({
        where: { loginPhone: phone },
        include: { member: true },
      });
      if (
        account?.member.isActive &&
        (mode === 'sms' || account.verificationMethod === 'local')
      ) {
        memberId = account.memberId;
      } else if (!account) {
        memberId = await this.rosterMatch(this.prisma, phone);
      }
    }
    const id = randomUUID();
    const code = String(randomInt(0, 1000000)).padStart(6, '0');
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRawUnsafe(
        'SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext($1))',
        phone,
      );
      await tx.otpChallenge.updateMany({
        where: { phone, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      await tx.otpChallenge.create({
        data: {
          id,
          phone,
          purpose,
          deliveryMode: mode,
          memberId,
          inviteId,
          codeHash: codeDigest(id, code),
          expiresAt,
        },
      });
    });
    if (memberId) {
      try {
        if (mode === 'sms') await this.smsDelivery.deliver(phone, code);
        else await this.localDelivery.deliver(id, code, expiresAt);
      } catch {
        await this.prisma.otpChallenge.update({
          where: { id },
          data: { consumedAt: new Date() },
        });
        // Keep the public response identical for unknown and eligible phones.
        this.logger.error('OTP delivery failed; challenge invalidated.');
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
    await this.throttle('verify-ip', peer, 60);
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
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    let memberId: string | null;
    try {
      memberId = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRawUnsafe(
          'SELECT id FROM otp_challenges WHERE id = $1::uuid FOR UPDATE',
          id,
        );
        const challenge = await tx.otpChallenge.findUnique({
          where: { id },
          include: { member: true },
        });
        if (
          !challenge ||
          challenge.deliveryMode !== mode ||
          challenge.consumedAt ||
          challenge.expiresAt <= new Date() ||
          challenge.attempts >= 5
        )
          return null;
        await tx.otpChallenge.update({
          where: { id },
          data: { attempts: { increment: 1 } },
        });
        if (
          !equalHash(challenge.codeHash, codeDigest(id, code)) ||
          !challenge.member?.isActive
        )
          return null;
        let account = await tx.account.findUnique({
          where: { memberId: challenge.memberId! },
        });
        if (challenge.purpose === 'claim') {
          if (!challenge.inviteId || account) return null;
          await tx.$queryRawUnsafe(
            'SELECT id FROM claim_invites WHERE id = $1::uuid FOR UPDATE',
            challenge.inviteId,
          );
          const invite = await tx.claimInvite.findUnique({
            where: { id: challenge.inviteId },
          });
          if (
            !invite ||
            invite.memberId !== challenge.memberId ||
            invite.consumedAt ||
            invite.revokedAt ||
            invite.expiresAt <= new Date()
          )
            return null;
          account = await tx.account.create({
            data: {
              memberId: challenge.memberId!,
              loginPhone: challenge.phone,
              verificationMethod: mode,
              verifiedAt: mode === 'sms' ? new Date() : null,
            },
          });
          await tx.claimInvite.updateMany({
            where: {
              memberId: challenge.memberId!,
              consumedAt: null,
              revokedAt: null,
            },
            data: { revokedAt: new Date() },
          });
          await tx.claimInvite.update({
            where: { id: invite.id },
            data: { consumedAt: new Date() },
          });
        }
        if (challenge.purpose === 'login' && !account) {
          // Recheck at verification so changed contacts, deactivation and duplicates
          // cannot authorize an old challenge. Serialize first login per member.
          await tx.$queryRawUnsafe(
            'SELECT id FROM members WHERE id=$1::uuid FOR UPDATE',
            challenge.memberId!,
          );
          if (
            (await this.rosterMatch(tx, challenge.phone)) !== challenge.memberId
          )
            return null;
          account = await tx.account.create({
            data: {
              memberId: challenge.memberId!,
              loginPhone: challenge.phone,
              verificationMethod: mode,
              verifiedAt: mode === 'sms' ? new Date() : null,
            },
          });
        }
        if (
          !account ||
          account.loginPhone !== challenge.phone ||
          (mode === 'local' && account.verificationMethod !== 'local')
        )
          return null;
        if (mode === 'sms') {
          if (account.verificationMethod !== 'sms') {
            await tx.account.update({
              where: { id: account.id },
              data: { verificationMethod: 'sms', verifiedAt: new Date() },
            });
            // Local test sessions must not inherit real SMS verification.
            await tx.authSession.updateMany({
              where: { accountId: account.id, revokedAt: null },
              data: { revokedAt: new Date() },
            });
          }
          if (rosterPhone(challenge.member.phone) === challenge.phone)
            await tx.member.update({
              where: { id: challenge.member.id },
              data: { phoneVerifiedAt: new Date() },
            });
        }
        await tx.otpChallenge.update({
          where: { id },
          data: { consumedAt: new Date() },
        });
        await tx.authSession.create({
          data: { tokenHash: digest(token), accountId: account.id, expiresAt },
        });
        return account.memberId;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        memberId = null;
      else throw error;
    }
    if (!memberId)
      throw new UnauthorizedException(
        'Code is invalid, expired, or no longer usable.',
      );
    return { token, expiresAt, memberId, deliveryMode: mode };
  }

  async authenticate(authorization?: string) {
    if (authorization?.match(/^Bearer test_[A-Za-z0-9_-]{43}$/))
      return this.testAccounts.authenticate(authorization);
    if (!authorization?.match(/^Bearer [A-Za-z0-9_-]{43}$/))
      throw new UnauthorizedException('Please sign in.');
    const { mode } = authConfig();
    const tokenHash = digest(authorization.slice(7));
    const session = await this.prisma.authSession.findUnique({
      where: { tokenHash },
      include: { account: { include: { member: true } } },
    });
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      !session.account.member.isActive ||
      (mode === 'local' && session.account.verificationMethod !== 'local') ||
      (mode === 'sms' && session.account.verificationMethod !== 'sms')
    ) {
      throw new UnauthorizedException(
        'Your session has ended. Please sign in.',
      );
    }
    return {
      tokenHash,
      memberId: session.account.memberId,
      testAccountId: null,
      loginPhone: session.account.loginPhone,
    };
  }

  async logout(tokenHash: string) {
    await this.testAccounts.logout(tokenHash);
    await this.prisma.authSession.updateMany({
      where: { tokenHash },
      data: { revokedAt: new Date() },
    });
  }
}
