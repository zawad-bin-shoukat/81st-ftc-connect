import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../dist/app.module.js';
import { PrismaService } from '../dist/database/prisma.service.js';

// Use a fresh process-only key and an ephemeral loopback port. Never print PII.
process.env.NODE_ENV = 'development';
process.env.LOCAL_API_TOKEN = randomBytes(32).toString('hex');
let app;
let checks = 0;
function check(condition, label) {
  if (!condition) throw new Error(label);
  checks++;
}
try {
  app = await NestFactory.create(AppModule, {
    logger: false,
    abortOnError: false,
  });
  await app.listen(0, '127.0.0.1');
  const base = await app.getUrl();
  const headers = { Authorization: 'Bearer ' + process.env.LOCAL_API_TOKEN };
  const get = (path) => fetch(base + path, { headers });
  for (const path of [
    '/members',
    '/members/filters',
    '/members/00000000-0000-4000-8000-000000000000',
  ]) {
    check(
      (await fetch(base + path)).status === 401,
      'Unauthenticated access was not rejected.',
    );
  }
  const response = await get('/members?pageSize=10');
  check(response.status === 200, 'Member list request failed.');
  check(
    response.headers.get('cache-control') === 'no-store',
    'Private data must not be cached.',
  );
  const body = await response.json();
  const prisma = app.get(PrismaService);
  const total = await prisma.member.count({ where: { isActive: true } });
  check(
    body.total === total && body.items.length === Math.min(10, total),
    'Pagination count mismatch.',
  );
  check(
    body.items.every(
      (member) =>
        !['phone', 'email', 'phoneVerifiedAt', 'profilePhotoKey'].some(
          (key) => key in member,
        ),
    ),
    'Directory summary exposes unintended fields.',
  );
  const nextPage = await (await get('/members?page=2&pageSize=10')).json();
  check(
    !nextPage.items.some((second) =>
      body.items.some((first) => first.id === second.id),
    ),
    'Pages overlap.',
  );
  const filters = await (await get('/members/filters')).json();
  check(
    Array.isArray(filters.sections) && Array.isArray(filters.cadres),
    'Filters failed.',
  );
  check(
    filters.homeDistricts.length === 64 &&
      new Set(filters.homeDistricts).size === 64,
    'District filter must contain the 64 Bangladesh districts.',
  );
  check(
    (await get('/members?pageSize=101')).status === 400,
    'Invalid page size was accepted.',
  );
  check(
    (await get('/members/not-a-uuid')).status === 400,
    'Invalid UUID was accepted.',
  );
  check(
    (await get('/members/00000000-0000-4000-8000-000000000000')).status === 404,
    'Unknown member should return 404.',
  );
  if (body.items.length) {
    const first = body.items[0];
    const detail = await (await get('/members/' + first.id)).json();
    const stored = await prisma.member.findUnique({ where: { id: first.id } });
    check(
      detail.phone === stored.phone && detail.bloodGroup === stored.bloodGroup,
      'Profile text was changed by the API.',
    );
    check(
      !('phoneVerifiedAt' in detail) && !('profilePhotoKey' in detail),
      'Internal fields leaked.',
    );
    const searchWord = first.name.match(/[A-Za-z]+/)?.[0];
    const found = await (
      await get('/members?q=' + encodeURIComponent(searchWord))
    ).json();
    check(
      found.items.some((item) => item.id === first.id),
      'Name word search failed.',
    );
    const literalWord = new RegExp(
      '(^|[^a-z0-9])' + searchWord + '([^a-z0-9]|$)',
      'i',
    );
    check(
      found.items.every((item) => literalWord.test(item.name)),
      'Search included a non-name or a partial name match.',
    );
    const idSearch = await (await get('/members?q=' + first.ftcId)).json();
    check(
      idSearch.total === 0,
      'FTC ID is still searchable.',
    );
    const section = await (
      await get('/members?section=' + encodeURIComponent(first.section))
    ).json();
    check(
      section.items.every((item) => item.section === first.section),
      'Section filter failed.',
    );
  }
  const anik = await (await get('/members?q=anik')).json();
  check(
    anik.items.every((item) => /(^|[^a-z0-9])anik([^a-z0-9]|$)/i.test(item.name)),
    'Anik search included a partial match such as Banik.',
  );
  const unknown = await (await get('/members?bcsBatch=unknown')).json();
  check(
    unknown.total ===
      (await prisma.member.count({
        where: { isActive: true, bcsBatch: null },
      })),
    'Unknown batch filter failed.',
  );
  const key = process.env.LOCAL_API_TOKEN;
  delete process.env.LOCAL_API_TOKEN;
  check(
    (await get('/members')).status === 503,
    'Missing configuration should disable the API.',
  );
  process.env.LOCAL_API_TOKEN = key;
  process.env.NODE_ENV = 'production';
  check(
    (await get('/members')).status === 503,
    'Development access must be disabled in production.',
  );
  console.log(
    checks +
      ' live API checks passed. Active members: ' +
      total +
      '. No participant values were logged.',
  );
} catch (error) {
  console.error(
    'API verification failed: ' + (error.message ?? 'unknown error'),
  );
  process.exitCode = 1;
} finally {
  await app?.close();
}
