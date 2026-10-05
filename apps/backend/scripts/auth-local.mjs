import 'dotenv/config';
import { parse } from 'dotenv';
import pg from 'pg';
import { randomBytes, createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, chmod } from 'node:fs/promises';
import { resolve } from 'node:path';

const [command, argument] = process.argv.slice(2);
const url = new URL(process.env.DATABASE_URL);
if (
  url.hostname !== '127.0.0.1' ||
  url.port !== '55432' ||
  url.pathname !== '/ftc_connect'
) {
  throw new Error(
    'This command is restricted to the local ftc_connect database.',
  );
}
async function main() {
  if (command === 'setup') {
    let content = await readFile('.env', 'utf8');
    const config = parse(content);
    if (config.NODE_ENV && config.NODE_ENV !== 'development')
      throw new Error('Existing environment is not development.');
    if (config.OTP_MODE && config.OTP_MODE !== 'local')
      throw new Error('An OTP provider is already configured.');
    const additions = [];
    if (!config.NODE_ENV) additions.push('NODE_ENV=development');
    if (!config.OTP_MODE) additions.push('OTP_MODE=local');
    if (!config.AUTH_OTP_SECRET)
      additions.push('AUTH_OTP_SECRET=' + randomBytes(32).toString('hex'));
    else if (!/^[a-f0-9]{64}$/.test(config.AUTH_OTP_SECRET))
      throw new Error('Existing AUTH_OTP_SECRET is invalid.');
    if (additions.length)
      content = content.trimEnd() + '\n' + additions.join('\n') + '\n';
    await writeFile('.env', content, { mode: 0o600 });
    await chmod('.env', 0o600);
    console.log('Local test login configured. No SMS will be sent.');
    return;
  }
  if (
    process.env.NODE_ENV !== 'development' ||
    process.env.OTP_MODE !== 'local'
  )
    throw new Error(
      'Local code lookup requires NODE_ENV=development OTP_MODE=local.',
    );
  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  try {
    if (command === 'invite') {
      if (!/^[1-9]\d*$/.test(argument ?? ''))
        throw new Error('Provide your FTC ID.');
      await client.query('BEGIN');
      const {
        rows: [member],
      } = await client.query(
        'SELECT id FROM members WHERE ftc_id=$1 AND is_active=true FOR UPDATE',
        [Number(argument)],
      );
      if (!member) throw new Error('Active member not found.');
      if (
        (
          await client.query('SELECT id FROM accounts WHERE member_id=$1', [
            member.id,
          ])
        ).rowCount
      )
        throw new Error('Profile already claimed; use phone login.');
      const token = randomBytes(32).toString('base64url');
      const expiresAt = new Date(Date.now() + 7 * 86400000);
      await client.query(
        'UPDATE claim_invites SET revoked_at=now() WHERE member_id=$1 AND consumed_at IS NULL AND revoked_at IS NULL',
        [member.id],
      );
      await client.query(
        'INSERT INTO claim_invites (member_id,token_hash,expires_at) VALUES ($1,$2,$3)',
        [
          member.id,
          createHash('sha256').update(token).digest('hex'),
          expiresAt,
        ],
      );
      const directory = resolve('../../.local/invites');
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const path = resolve(directory, argument + '.txt');
      await writeFile(
        path,
        'FTC ID: ' +
          argument +
          '\nPrivate invite code: ' +
          token +
          '\nExpires: ' +
          expiresAt.toISOString() +
          '\nLocal test only. No SMS verification.\n',
        { mode: 0o600 },
      );
      await chmod(path, 0o600);
      await client.query('COMMIT');
      console.log('Private test invite saved: ' + path);
    } else if (command === 'code') {
      if (argument && !/^[0-9a-f-]{36}$/i.test(argument))
        throw new Error('Invalid challenge ID.');
      const {
        rows: [challenge],
      } = await client.query(
        `SELECT id FROM (
           SELECT id, created_at FROM otp_challenges
           WHERE member_id IS NOT NULL AND delivery_mode='local'
             AND consumed_at IS NULL AND attempts<5 AND expires_at>now()
           UNION ALL
           SELECT id, created_at FROM test_otp_challenges
           WHERE test_account_id IS NOT NULL AND delivery_mode='local'
             AND consumed_at IS NULL AND attempts<5 AND expires_at>now()
         ) AS active
         WHERE ($1::uuid IS NULL OR id=$1::uuid)
         ORDER BY created_at DESC LIMIT 1`,
        [argument ?? null],
      );
      if (!challenge)
        throw new Error(
          'No active test code. Check the invite/phone and request a new code in the app.',
        );
      const path = resolve(
        process.env.LOCAL_OTP_DIR ?? '../../.local/otp',
        challenge.id + '.json',
      );
      const code = JSON.parse(await readFile(path, 'utf8'));
      console.log(
        'LOCAL TEST CODE: ' +
          code.code +
          '\nExpires: ' +
          code.expiresAt +
          '\nNo SMS was sent.',
      );
    } else
      throw new Error('Use setup, invite <FTC ID>, or code [challenge ID].');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}
main().catch((error) => {
  console.error(
    error.code
      ? 'Local auth command failed (' + error.code + ').'
      : error.message,
  );
  process.exitCode = 1;
});
