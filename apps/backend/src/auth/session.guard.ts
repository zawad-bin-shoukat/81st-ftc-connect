import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service.js';

export type MemberRequest = Request & {
  auth: {
    memberId: string | null;
    testAccountId: string | null;
    tokenHash: string;
    loginPhone: string;
  };
};

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}
  async canActivate(context: ExecutionContext) {
    const http = context.switchToHttp();
    http.getResponse<Response>().setHeader('Cache-Control', 'no-store');
    const request = http.getRequest<MemberRequest>();
    request.auth = await this.auth.authenticate(request.headers.authorization);
    return true;
  }
}
