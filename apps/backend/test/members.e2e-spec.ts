import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { MembersController } from '../src/members/members.controller.js';
import { MembersService } from '../src/members/members.service.js';
import { LocalApiGuard } from '../src/members/local-api.guard.js';
import { SessionGuard } from '../src/auth/session.guard.js';
import { UnauthorizedException } from '@nestjs/common';
import { parseMemberQuery } from '../src/members/member-query.js';

describe('private member HTTP routes', () => {
  let app: INestApplication;
  const token = 'a'.repeat(64);
  const service = {
    list: vi.fn((query) => ({
      items: [],
      total: 0,
      ...parseMemberQuery(query),
    })),
    filters: vi.fn(() => ({ sections: ['A'] })),
    detail: vi.fn(() => ({ id: '12345678-1234-4234-8234-123456789012' })),
  };

  beforeEach(async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('LOCAL_API_TOKEN', token);
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [MembersController],
      providers: [
        {
          provide: SessionGuard,
          useValue: {
            canActivate() {
              throw new UnauthorizedException();
            },
          },
        },
        LocalApiGuard,
        { provide: MembersService, useValue: service },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app?.close();
    vi.unstubAllEnvs();
  });

  it('rejects missing and wrong credentials before querying data', async () => {
    await request(app.getHttpServer()).get('/members').expect(401);
    await request(app.getHttpServer())
      .get('/members/filters')
      .set('Authorization', 'Bearer wrong')
      .expect(401);
    await request(app.getHttpServer())
      .get('/members/12345678-1234-4234-8234-123456789012')
      .expect(401);
    expect(service.list).not.toHaveBeenCalled();
    expect(service.filters).not.toHaveBeenCalled();
    expect(service.detail).not.toHaveBeenCalled();
  });

  it('is unavailable when unconfigured or outside development', async () => {
    vi.stubEnv('LOCAL_API_TOKEN', '');
    await request(app.getHttpServer())
      .get('/members')
      .set('Authorization', 'Bearer ' + token)
      .expect(503);
    vi.stubEnv('LOCAL_API_TOKEN', token);
    vi.stubEnv('NODE_ENV', 'production');
    await request(app.getHttpServer())
      .get('/members')
      .set('Authorization', 'Bearer ' + token)
      .expect(503);
  });

  it('serves filters before the ID route and validates query parameters and UUIDs', async () => {
    const auth = { Authorization: 'Bearer ' + token };
    const response = await request(app.getHttpServer())
      .get('/members/filters')
      .set(auth)
      .expect(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.sections).toEqual(['A']);
    await request(app.getHttpServer())
      .get('/members?pageSize=101')
      .set(auth)
      .expect(400);
    await request(app.getHttpServer())
      .get('/members?section=A&section=B')
      .set(auth)
      .expect(400);
    await request(app.getHttpServer())
      .get('/members/not-a-uuid')
      .set(auth)
      .expect(400);
    await request(app.getHttpServer())
      .get('/members?page=2')
      .set(auth)
      .expect(200);
  });
});
