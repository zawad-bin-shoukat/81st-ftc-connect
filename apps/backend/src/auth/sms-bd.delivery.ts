import { Injectable } from '@nestjs/common';
import { authConfig } from './auth-input.js';

@Injectable()
export class SmsBdDelivery {
  async deliver(phone: string, code: string) {
    if (authConfig().mode !== 'sms') throw new Error('SMS mode is disabled');
    // The provider receives the number and code; never log either or the API key.
    const response = await fetch('https://api.sms.net.bd/sendsms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: process.env.SMS_BD_API_KEY,
        msg: `81st FTC Connect: Your verification code is ${code}. It expires in 5 minutes.`,
        to: phone.replace(/^\+/, ''),
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error('SMS provider unavailable');
    const result: unknown = await response.json();
    if (
      !result ||
      typeof result !== 'object' ||
      !('error' in result) ||
      Number(result.error) !== 0 ||
      !('data' in result) ||
      !result.data ||
      typeof result.data !== 'object' ||
      !('request_id' in result.data)
    )
      throw new Error('SMS provider rejected the message');
  }
}
