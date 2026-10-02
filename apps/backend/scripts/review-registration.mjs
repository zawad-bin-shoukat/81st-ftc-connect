import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { PrismaService } from '../dist/database/prisma.service.js';
import { RegistrationService } from '../dist/auth/registration.service.js';
const url = new URL(process.env.DATABASE_URL);
if (
  url.hostname !== '127.0.0.1' ||
  url.port !== '55432' ||
  url.pathname !== '/ftc_connect'
)
  throw new Error('This tool is restricted to the local roster database.');
const [action, id, profileFile] = process.argv.slice(2);
const db = new PrismaService();
try {
  if (action === 'list') {
    console.log(
      JSON.stringify(
        await db.registrationRequest.findMany({
          where: { status: 'pending' },
          orderBy: { createdAt: 'asc' },
        }),
        null,
        2,
      ),
    );
  } else {
    if (!/^[0-9a-f-]{36}$/i.test(id ?? ''))
      throw new Error('Provide a request UUID.');
    if (action === 'approve') {
      if (!profileFile)
        throw new Error(
          'Provide the reviewed profile JSON file. Verify membership before approval.',
        );
      const result = await new RegistrationService(db).approve(
        id,
        JSON.parse(await readFile(profileFile, 'utf8')),
      );
      console.log(
        'Approved FTC ID ' +
          result.ftcId +
          '. They can now sign in with their submitted phone and OTP.',
      );
    } else if (action === 'reject') {
      await new RegistrationService(db).reject(id);
      console.log('Request rejected. No roster record created.');
    } else
      throw new Error(
        'Use list, approve REQUEST_ID PROFILE_JSON, or reject REQUEST_ID.',
      );
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
