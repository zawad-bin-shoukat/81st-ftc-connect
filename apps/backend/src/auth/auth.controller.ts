import {
  Body,
  Controller,
  Header,
  HttpCode,
  Inject,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { RegistrationService } from './registration.service.js';
import { localAuthConfig } from './auth-input.js';
import type { Request } from 'express';
import { AuthService } from './auth.service.js';
import { SessionGuard } from './session.guard.js';
import type { MemberRequest } from './session.guard.js';

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(RegistrationService)
    private readonly registrations: RegistrationService,
  ) {}
  @Post('registration')
  @HttpCode(202)
  @Header('Cache-Control', 'no-store')
  async register(@Body() body: unknown, @Req() request: Request) {
    localAuthConfig();
    await this.auth.throttle(
      'registration-ip',
      request.socket.remoteAddress ?? 'unknown',
      5,
      3600,
    );
    return this.registrations.submit(body);
  }
  @Post('claim')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  claim(@Body() body: unknown, @Req() request: Request) {
    return this.auth.start(
      body,
      'claim',
      request.socket.remoteAddress ?? 'unknown',
    );
  }
  @Post('login')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  login(@Body() body: unknown, @Req() request: Request) {
    return this.auth.start(
      body,
      'login',
      request.socket.remoteAddress ?? 'unknown',
    );
  }
  @Post('verify')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  verify(@Body() body: unknown, @Req() request: Request) {
    return this.auth.verify(body, request.socket.remoteAddress ?? 'unknown');
  }
  @Post('logout')
  @HttpCode(204)
  @UseGuards(SessionGuard)
  async logout(@Req() request: MemberRequest) {
    await this.auth.logout(request.auth.tokenHash);
  }
}
