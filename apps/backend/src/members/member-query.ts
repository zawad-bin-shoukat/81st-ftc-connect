import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { bangladeshDistrictSet } from './districts.js';

export const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseMemberQuery(query: Record<string, unknown>) {
  const allowed = new Set([
    'q',
    'section',
    'cadreId',
    'bcsBatch',
    'bloodGroup',
    'homeDistrict',
    'page',
    'pageSize',
  ]);
  for (const [key, value] of Object.entries(query)) {
    if (!allowed.has(key) || typeof value !== 'string') {
      throw new BadRequestException(
        'Unknown or repeated query parameter: ' + key,
      );
    }
  }
  function integer(key: string, fallback: number, max: number) {
    const raw = query[key];
    if (raw === undefined) return fallback;
    if (
      typeof raw !== 'string' ||
      !/^[1-9]\d*$/.test(raw) ||
      Number(raw) > max
    ) {
      throw new BadRequestException(
        key + ' must be an integer from 1 to ' + max,
      );
    }
    return Number(raw);
  }
  function text(key: string, maxLength: number, trim = true) {
    const value = query[key] as string | undefined;
    if (value === undefined) return undefined;
    if (value.length > maxLength || !value.trim()) {
      throw new BadRequestException(
        key + ' must contain 1 to ' + maxLength + ' characters.',
      );
    }
    return trim ? value.trim() : value;
  }
  const page = integer('page', 1, 100000);
  const pageSize = integer('pageSize', 25, 100);
  const q = text('q', 150);
  const section = text('section', 2);
  const cadreId = text('cadreId', 36);
  if (cadreId && !uuidPattern.test(cadreId))
    throw new BadRequestException('cadreId must be a UUID.');
  const where: Prisma.MemberWhereInput = { isActive: true };
  if (section) where.section = section;
  if (cadreId) where.cadreId = cadreId;
  if (query.bcsBatch !== undefined) {
    where.bcsBatch =
      query.bcsBatch === 'unknown' ? null : integer('bcsBatch', 1, 32767);
  }
  // Exact free-text filters: no normalization that could change stored meanings.
  const bloodGroup = text('bloodGroup', 500, false);
  const homeDistrict = text('homeDistrict', 100, false);
  if (bloodGroup) where.bloodGroup = bloodGroup;
  if (homeDistrict) {
    if (!bangladeshDistrictSet.has(homeDistrict))
      throw new BadRequestException('Choose one of the 64 Bangladesh districts.');
    where.homeDistrict = homeDistrict;
  }
  return { where, q, page, pageSize, skip: (page - 1) * pageSize };
}

export function nameWordPattern(query: string) {
  const literal = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return '(^|[^[:alnum:]])' + literal + '([^[:alnum:]]|$)';
}
