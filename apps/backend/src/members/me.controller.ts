import {
  Body,
  Controller,
  Get,
  Inject,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SessionGuard } from '../auth/session.guard.js';
import type { MemberRequest } from '../auth/session.guard.js';
import { MembersService } from './members.service.js';

@Controller('me')
@UseGuards(SessionGuard)
export class MeController {
  constructor(
    @Inject(MembersService) private readonly members: MembersService,
  ) {}
  @Get()
  async me(@Req() request: MemberRequest) {
    return {
      ...(await this.members.detail(request.auth.memberId)),
      loginPhone: request.auth.loginPhone,
      authenticationMode: 'local',
    };
  }
  @Patch()
  update(@Req() request: MemberRequest, @Body() body: unknown) {
    return this.members.updateOwn(request.auth.memberId, body);
  }
}
