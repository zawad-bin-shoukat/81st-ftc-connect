import { Injectable } from '@nestjs/common';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { localAuthConfig } from './auth-input.js';

@Injectable()
export class LocalOtpDelivery {
  async deliver(id: string, code: string, expiresAt: Date) {
    localAuthConfig();
    const directory = process.env.LOCAL_OTP_DIR ?? resolve('../../.local/otp');
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(
      resolve(directory, id + '.json'),
      JSON.stringify({ challengeId: id, code, expiresAt }) + '\n',
      { mode: 0o600, flag: 'wx' },
    );
  }
}
