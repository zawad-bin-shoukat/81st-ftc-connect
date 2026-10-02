import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from './admin-access.js';
import { SessionGuard } from './session.guard.js';
import type { MemberRequest } from './session.guard.js';
import { RegistrationService } from './registration.service.js';
import { objectBody, stringField } from './auth-input.js';

@Controller('admin/registrations')
@UseGuards(SessionGuard, AdminGuard)
export class AdminController {
  constructor(
    @Inject(RegistrationService)
    private readonly registrations: RegistrationService,
  ) {}

  @Get()
  list(@Query() query: Record<string, unknown>) {
    return this.registrations.list(query);
  }

  @Get(':id')
  detail(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.registrations.detail(id);
  }

  @Post(':id/approve')
  approve(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
    @Req() request: MemberRequest,
  ) {
    const input = objectBody(body, [
      'profile',
      'reviewNote',
      'membershipConfirmed',
    ]);
    if (input.membershipConfirmed !== true)
      throw new BadRequestException('Confirm membership before approval.');
    return this.registrations.approve(id, input.profile, {
      memberId: request.auth.memberId ?? undefined,
      testAccountId: request.auth.testAccountId ?? undefined,
      note: stringField(input.reviewNote, 'verification note', 1000),
    });
  }

  @Post(':id/reject')
  reject(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
    @Req() request: MemberRequest,
  ) {
    const input = objectBody(body, ['reviewNote']);
    return this.registrations.reject(id, {
      memberId: request.auth.memberId ?? undefined,
      testAccountId: request.auth.testAccountId ?? undefined,
      note: stringField(input.reviewNote, 'rejection reason', 1000),
    });
  }
}
