import {
  Body,
  Controller,
  Get,
  Inject,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { TestAccountService } from '../auth/test-account.service.js';
import { AdminAccess } from '../auth/admin-access.js';
import { authConfig } from '../auth/auth-input.js';
import { SessionGuard } from '../auth/session.guard.js';
import type { MemberRequest } from '../auth/session.guard.js';
import { MembersService } from './members.service.js';

@Controller('me')
@UseGuards(SessionGuard)
export class MeController {
  constructor(
    @Inject(MembersService) private readonly members: MembersService,
    @Inject(AdminAccess) private readonly adminAccess: AdminAccess,
    @Inject(TestAccountService)
    private readonly testAccounts: TestAccountService,
  ) {}
  @Get()
  async me(@Req() request: MemberRequest) {
    if (request.auth.testAccountId)
      return this.testAccounts.profile(request.auth.testAccountId);
    return {
      ...(await this.members.detail(request.auth.memberId!)),
      loginPhone: request.auth.loginPhone,
      authenticationMode: authConfig().mode,
      isAdministrator: await this.adminAccess.allowed(request.auth.memberId!),
    };
  }
  @Patch()
  update(@Req() request: MemberRequest, @Body() body: unknown) {
    if (request.auth.testAccountId)
      return this.testAccounts.updateOwn(request.auth.testAccountId, body);
    return this.members.updateOwn(request.auth.memberId!, body);
  }
}
