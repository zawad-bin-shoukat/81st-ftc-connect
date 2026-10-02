import 'dotenv/config';
import { PrismaService } from '../dist/database/prisma.service.js';
import {
  initialTestProfile,
  testAccountConfig,
} from '../dist/auth/test-account.service.js';
const url = new URL(process.env.DATABASE_URL);
if (
  url.hostname !== '127.0.0.1' ||
  url.port !== '55432' ||
  url.pathname !== '/ftc_connect'
)
  throw new Error(
    'This setup tool is restricted to the local project database.',
  );
const config = testAccountConfig();
if (!config)
  throw new Error(
    'Configure TEST_ADMIN_ENABLED=true, TEST_ADMIN_ID and TEST_ADMIN_PHONE in the private backend .env first.',
  );
const db = new PrismaService();
try {
  const existing = await db.testAccount.findUnique({
    where: { testId: config.testId },
  });
  if (existing && existing.phone !== config.phone)
    throw new Error(
      'Existing test identity uses another number. Review manually; no identity was reassigned.',
    );
  if (!existing)
    await db.testAccount.create({
      data: {
        testId: config.testId,
        phone: config.phone,
        profile: { ...initialTestProfile, phone: config.phone },
      },
    });
  console.log(
    'Separate administrator/test identity ' +
      config.testId +
      ' is ready. Sign in from the administrator/test entry and verify phone OTP. No participant or participant account was changed.',
  );
} finally {
  await db.$disconnect();
}
