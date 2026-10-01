import { BadRequestException } from '@nestjs/common';
import { objectBody } from '../auth/auth-input.js';
import type { Prisma } from '../generated/prisma/client.js';

export function profileInput(body: unknown): Prisma.MemberUpdateInput {
  const limits: Record<string, number> = {
    name: 150,
    education: 10000,
    university: 255,
    phone: 1000,
    email: 254,
    bloodGroup: 500,
    homeDistrict: 100,
    aboutMe: 10000,
    favouriteQuotation: 10000,
  };
  const input = objectBody(body, [...Object.keys(limits), 'bcsBatch']);
  if (!Object.keys(input).length)
    throw new BadRequestException('No profile changes supplied.');
  const result: Record<string, string | number | null> = {};
  for (const [key, value] of Object.entries(input)) {
    if (key === 'bcsBatch') {
      if (
        value !== null &&
        (typeof value !== 'number' ||
          !Number.isInteger(value) ||
          value < 1 ||
          value > 32767)
      ) {
        throw new BadRequestException(
          'BCS batch must be a positive number or unknown.',
        );
      }
      result[key] = value as number | null;
      continue;
    }
    const optional = key === 'aboutMe' || key === 'favouriteQuotation';
    if (optional && value === null) {
      result[key] = null;
      continue;
    }
    if (
      typeof value !== 'string' ||
      [...value].length > limits[key] ||
      (!optional && !value.trim())
    ) {
      throw new BadRequestException('Check ' + key + '.');
    }
    result[key] = value;
  }
  if (typeof result.email === 'string') {
    result.email = result.email.trim();
    const valid =
      /^[A-Za-z0-9!#$%&'*+/=?^_\x60{|}~-]+(\.[A-Za-z0-9!#$%&'*+/=?^_\x60{|}~-]+)*@[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
    if (!valid.test(result.email) || result.email.split('@')[0].length > 64)
      throw new BadRequestException('Enter a valid email address.');
  }
  return result;
}
