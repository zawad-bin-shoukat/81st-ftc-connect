import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { SessionGuard } from '../auth/session.guard.js';
import { LocalApiGuard } from './local-api.guard.js';

@Injectable()
export class DirectoryAccessGuard implements CanActivate {
  constructor(
    @Inject(SessionGuard) private readonly sessions: SessionGuard,
    @Inject(LocalApiGuard) private readonly local: LocalApiGuard,
  ) {}
  canActivate(context: ExecutionContext) {
    const authorization = context.switchToHttp().getRequest<Request>()
      .headers.authorization;
    // Retain the server-only development checker. Never used by the mobile app.
    if (/^Bearer [a-f0-9]{64}$/.test(authorization ?? ''))
      return this.local.canActivate(context);
    return this.sessions.canActivate(context);
  }
}
