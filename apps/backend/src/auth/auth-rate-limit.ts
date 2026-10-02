import { HttpException } from '@nestjs/common';
import { digest } from './auth-input.js';
import type { PrismaService } from '../database/prisma.service.js';

// Shared quotas prevent the separate sign-in namespaces from bypassing phone limits.
export async function consumeRateLimit(
  db: PrismaService,
  scope: string,
  identity: string,
  maximum: number,
  seconds = 900,
) {
  const window = Math.floor(Date.now() / (seconds * 1000));
  const key = digest(scope + ':' + identity + ':' + window);
  const row = await db.authRateLimit.upsert({
    where: { key },
    create: { key, expiresAt: new Date((window + 1) * seconds * 1000) },
    update: { count: { increment: 1 } },
  });
  if (row.count > maximum)
    throw new HttpException('Too many attempts. Please try again later.', 429);
}
