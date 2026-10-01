import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL must be configured.');
    // The adapter serializes dates in UTC without an offset and expects UTC
    // results. Set every pooled connection to UTC, regardless of the DB default.
    super({
      adapter: new PrismaPg({ connectionString, options: '-c timezone=UTC' }),
    });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
