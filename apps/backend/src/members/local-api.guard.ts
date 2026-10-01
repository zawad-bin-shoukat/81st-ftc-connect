import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';

// Temporary developer access only. Never bundle this credential in Flutter.
// Real member sessions must replace this guard before device/public integration.
@Injectable()
export class LocalApiGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    http.getResponse<Response>().setHeader('Cache-Control', 'no-store');
    const token = process.env.LOCAL_API_TOKEN ?? '';
    if (
      process.env.NODE_ENV !== 'development' ||
      !/^[a-f0-9]{64}$/.test(token)
    ) {
      throw new ServiceUnavailableException(
        'Member APIs are not enabled for local development.',
      );
    }
    // Check the actual socket, never the client-controlled forwarded headers.
    if (
      !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(
        request.socket.remoteAddress ?? '',
      )
    ) {
      throw new UnauthorizedException();
    }
    const supplied = request.headers.authorization ?? '';
    const expected = 'Bearer ' + token;
    const suppliedBytes = Buffer.from(supplied);
    const expectedBytes = Buffer.from(expected);
    if (
      suppliedBytes.length !== expectedBytes.length ||
      !timingSafeEqual(suppliedBytes, expectedBytes)
    ) {
      throw new UnauthorizedException();
    }
    return true;
  }
}
