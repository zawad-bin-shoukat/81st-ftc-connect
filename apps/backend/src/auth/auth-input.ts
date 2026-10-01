import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export function authConfig(): { mode: 'local' | 'sms'; secret: string } {
  const mode = process.env.OTP_MODE;
  if (
    (mode !== 'local' && mode !== 'sms') ||
    (mode === 'local' && process.env.NODE_ENV !== 'development') ||
    (mode === 'sms' && !process.env.SMS_BD_API_KEY?.trim()) ||
    !/^[a-f0-9]{64}$/.test(process.env.AUTH_OTP_SECRET ?? '')
  ) {
    throw new ServiceUnavailableException('Phone login is not configured.');
  }
  return { mode, secret: process.env.AUTH_OTP_SECRET! };
}
export function localAuthConfig() {
  const config = authConfig();
  if (config.mode !== 'local')
    throw new ServiceUnavailableException('Local test codes are disabled.');
  return config.secret;
}
export const digest = (value: string) =>
  createHash('sha256').update(value).digest('hex');
export const codeDigest = (id: string, code: string) =>
  createHmac('sha256', authConfig().secret)
    .update(id + ':' + code)
    .digest('hex');
export const equalHash = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export function objectBody(
  body: unknown,
  fields: string[],
): Record<string, unknown> {
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    Object.keys(body).some((key) => !fields.includes(key))
  ) {
    throw new BadRequestException('Invalid request fields.');
  }
  return body as Record<string, unknown>;
}
export function stringField(value: unknown, field: string, max = 200): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) {
    throw new BadRequestException('Check ' + field + '.');
  }
  return value.trim();
}
// Interpret only a single unambiguous number; preserve the source contact text.
export function rosterPhone(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 40) return null;
  let phone = value
    .trim()
    .replace(/[০-৯]/g, (digit) => String(digit.codePointAt(0)! - 0x09e6))
    .replace(/[ ()-]/g, '');
  if (/^01[3-9]\d{8}$/.test(phone)) phone = '+88' + phone;
  else if (/^8801[3-9]\d{8}$/.test(phone)) phone = '+' + phone;
  if (phone.startsWith('+880') && !/^\+8801[3-9]\d{8}$/.test(phone))
    return null;
  return /^\+[1-9]\d{7,14}$/.test(phone) ? phone : null;
}

export function loginPhone(value: unknown): string {
  const phone = rosterPhone(value);
  if (!phone)
    throw new BadRequestException(
      'Enter one mobile number, for example 01… or +880… with all digits.',
    );
  return phone;
}
