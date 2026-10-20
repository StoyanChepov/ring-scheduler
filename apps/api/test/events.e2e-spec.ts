/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call --
   supertest response bodies are untyped by nature. */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { createFakePrisma } from './helpers/fake-prisma';

describe('Alarm history (HTTP)', () => {
  let app: INestApplication<App>;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'e2e-secret-that-is-comfortably-over-32-chars';
    delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    delete process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(createFakePrisma())
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app.close();
    jest.restoreAllMocks();
  });

  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  let validationUser: Awaited<ReturnType<typeof setup>> | undefined;

  const setup = async (email: string) => {
    const token = (
      await http
        .post('/auth/register')
        .send({ email, password: 'correct horse' })
        .expect(201)
    ).body.accessToken;
    const phone = (
      await http
        .post('/devices')
        .set(bearer(token))
        .send({ name: 'Phone', platform: 'ANDROID' })
        .expect(201)
    ).body;
    return { token, phone, url: `/devices/${phone.id}/events` };
  };

  const event = (overrides: Record<string, unknown> = {}) => ({
    id: randomUUID(),
    type: 'STARTED',
    source: 'SCHEDULE',
    scheduleId: randomUUID(),
    occurredAt: new Date().toISOString(),
    ...overrides,
  });

  it('stores what the phone reports and lists it newest first', async () => {
    const { token, phone, url } = await setup('history@example.com');
    const started = event({
      occurredAt: new Date(Date.now() - 60_000).toISOString(),
    });
    const finished = event({
      type: 'FINISHED',
      scheduleId: started.scheduleId,
    });

    const reported = await http
      .post('/device/events')
      .set(bearer(phone.deviceKey))
      .send({ events: [started, finished] })
      .expect(200);
    expect(reported.body).toEqual({ received: 2, stored: 2 });

    const list = await http.get(url).set(bearer(token)).expect(200);
    expect(list.body.map((e: { id: string }) => e.id)).toEqual([
      finished.id,
      started.id,
    ]);
    expect(list.body[0]).toMatchObject({
      type: 'FINISHED',
      source: 'SCHEDULE',
      deviceId: phone.id,
    });
  });

  it('ignores an event the phone sends twice (a retried upload)', async () => {
    const { phone } = await setup('retry@example.com');
    const once = event();

    await http
      .post('/device/events')
      .set(bearer(phone.deviceKey))
      .send({ events: [once] })
      .expect(200);
    const retried = await http
      .post('/device/events')
      .set(bearer(phone.deviceKey))
      .send({ events: [once, event()] })
      .expect(200);

    expect(retried.body).toEqual({ received: 2, stored: 1 });
  });

  it.each([
    ['an empty batch', { events: [] }],
    ['an unknown type', { events: [{ ...event(), type: 'EXPLODED' }] }],
    ['an unknown source', { events: [{ ...event(), source: 'MAGIC' }] }],
    ['a non-UUID id', { events: [{ ...event(), id: '1' }] }],
    ['a missing time', { events: [{ ...event(), occurredAt: undefined }] }],
    ['an overlong detail', { events: [event({ detail: 'x'.repeat(201) })] }],
    [
      'more than 50 events',
      { events: Array.from({ length: 51 }, () => event()) },
    ],
  ])('rejects %s with 400', async (_name, body) => {
    // One shared user: registering one per case would hit the sign-up rate limit.
    validationUser ??= await setup('bad-events@example.com');
    const { phone } = validationUser;

    await http
      .post('/device/events')
      .set(bearer(phone.deviceKey))
      .send(body)
      .expect(400);
  });

  it('needs the device key to report and the owner login to read', async () => {
    const owner = await setup('history-owner@example.com');
    const other = await setup('history-other@example.com');

    await http
      .post('/device/events')
      .send({ events: [event()] })
      .expect(401);
    // A user login is not a device key.
    await http
      .post('/device/events')
      .set(bearer(owner.token))
      .send({ events: [event()] })
      .expect(401);

    await http.get(owner.url).expect(401);
    await http.get(owner.url).set(bearer(other.token)).expect(404);
  });
});
