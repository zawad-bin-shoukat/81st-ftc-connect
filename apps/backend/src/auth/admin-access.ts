import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { TestAccountService } from './test-account.service.js';
import type { MemberRequest } from './session.guard.js';

@Injectable()
export class AdminAccess {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}

  async allowed(memberId: string): Promise<boolean> {
    // Fail closed for empty or malformed configuration. Never accept roles from a client.
    const configured = (process.env.ADMIN_FTC_IDS ?? '').trim();
    if (!configured || !/^[1-9][0-9]*(\s*,\s*[1-9][0-9]*)*$/.test(configured))
      return false;
    const ids = configured.split(',').map(Number);
    if (ids.some((id) => !Number.isSafeInteger(id) || id > 2147483647))
      return false;
    const member = await this.db.member.findUnique({
      where: { id: memberId },
      select: {
        ftcId: true,
        isActive: true,
        account: { select: { verificationMethod: true } },
      },
    });
    return (
      !!member?.isActive &&
      ids.includes(member.ftcId) &&
      (member.account?.verificationMethod === 'sms' ||
        (process.env.NODE_ENV === 'development' &&
          process.env.OTP_MODE === 'local' &&
          member.account?.verificationMethod === 'local'))
    );
  }
}

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    @Inject(AdminAccess) private readonly access: AdminAccess,
    @Inject(TestAccountService)
    private readonly testAccounts: TestAccountService,
  ) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<MemberRequest>();
    const allowed = request.auth?.testAccountId
      ? await this.testAccounts.allowed(request.auth.testAccountId)
      : request.auth?.memberId
        ? await this.access.allowed(request.auth.memberId)
        : false;
    if (!allowed)
      throw new ForbiddenException('Administrator access required.');
    return true;
  }
}
