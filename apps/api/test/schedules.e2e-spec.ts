/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument --
   supertest response bodies are untyped by nature. */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { createFakePrisma } from './helpers/fake-prisma';

describe('Schedules (HTTP)', () => {
  let app: INestApplication<App>;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'e2e-secret-that-is-comfortably-over-32-chars';
    // Push stays disabled in tests, whatever the developer's .env says.
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
  const inAnHour = () => new Date(Date.now() + 3_600_000).toISOString();

  /** A user with one registered phone. */
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
    const url = `/devices/${phone.id}/schedules`;
    return { token, phone, url };
  };

  it('creates, lists, pauses and deletes schedules', async () => {
    const { token, url } = await setup('crud@example.com');

    const weekly = await http
      .post(url)
      .set(bearer(token))
      .send({ kind: 'WEEKLY', timeOfDay: '07:30', daysOfWeek: [1, 2, 3, 4, 5] })
      .expect(201);
    expect(weekly.body).toMatchObject({
      kind: 'WEEKLY',
      timeOfDay: '07:30',
      durationSeconds: 30,
      isActive: true,
    });

    await http
      .post(url)
      .set(bearer(token))
      .send({ kind: 'ONE_TIME', startAt: inAnHour(), label: 'Meeting' })
      .expect(201);

    const list = await http.get(url).set(bearer(token)).expect(200);
    expect(list.body).toHaveLength(2);

    const paused = await http
      .patch(`${url}/${weekly.body.id}`)
      .set(bearer(token))
      .send({ isActive: false })
      .expect(200);
    expect(paused.body.isActive).toBe(false);

    await http
      .delete(`${url}/${weekly.body.id}`)
      .set(bearer(token))
      .expect(204);
    await http
      .delete(`${url}/${weekly.body.id}`)
      .set(bearer(token))
      .expect(404);
  });

  it.each([
    ['an unknown kind', { kind: 'DAILY' }],
    ['a one-time alarm without startAt', { kind: 'ONE_TIME' }],
    [
      'a startAt without a time zone',
      { kind: 'ONE_TIME', startAt: 'tomorrow' },
    ],
    [
      'a one-time alarm in the past',
      { kind: 'ONE_TIME', startAt: '2020-01-01T00:00:00Z' },
    ],
    ['a weekly alarm without days', { kind: 'WEEKLY', timeOfDay: '07:30' }],
    [
      'a weekly alarm with no days',
      { kind: 'WEEKLY', timeOfDay: '07:30', daysOfWeek: [] },
    ],
    [
      'a day out of range',
      { kind: 'WEEKLY', timeOfDay: '07:30', daysOfWeek: [0] },
    ],
    [
      'a repeated day',
      { kind: 'WEEKLY', timeOfDay: '07:30', daysOfWeek: [1, 1] },
    ],
    [
      'a 12-hour time',
      { kind: 'WEEKLY', timeOfDay: '7:30 pm', daysOfWeek: [1] },
    ],
    [
      'an impossible time',
      { kind: 'WEEKLY', timeOfDay: '24:00', daysOfWeek: [1] },
    ],
    [
      'a duration over 5 minutes',
      {
        kind: 'WEEKLY',
        timeOfDay: '07:30',
        daysOfWeek: [1],
        durationSeconds: 301,
      },
    ],
  ])('rejects %s with 400', async (_name, body) => {
    // One shared user: registering one per case would hit the sign-up rate limit.
    validationUser ??= await setup('validation@example.com');
    const { token, url } = validationUser;

    await http.post(url).set(bearer(token)).send(body).expect(400);
  });

  it('keeps one user out of another user’s schedules', async () => {
    const owner = await setup('sched-owner@example.com');
    const other = await setup('sched-other@example.com');

    const created = await http
      .post(owner.url)
      .set(bearer(owner.token))
      .send({ kind: 'ONE_TIME', startAt: inAnHour() })
      .expect(201);

    await http.get(owner.url).set(bearer(other.token)).expect(404);
    await http
      .post(owner.url)
      .set(bearer(other.token))
      .send({ kind: 'ONE_TIME', startAt: inAnHour() })
      .expect(404);
    // Reaching the schedule through the other user's own device fails too.
    await http
      .delete(`${other.url}/${created.body.id}`)
      .set(bearer(other.token))
      .expect(404);
  });

  it('gives the phone its active schedules, with its device key', async () => {
    const { token, phone, url } = await setup('phone-sync@example.com');

    const kept = await http
      .post(url)
      .set(bearer(token))
      .send({ kind: 'WEEKLY', timeOfDay: '06:45', daysOfWeek: [6, 7] })
      .expect(201);
    const paused = await http
      .post(url)
      .set(bearer(token))
      .send({ kind: 'ONE_TIME', startAt: inAnHour() })
      .expect(201);
    await http
      .patch(`${url}/${paused.body.id}`)
      .set(bearer(token))
      .send({ isActive: false })
      .expect(200);

    const synced = await http
      .get('/device/schedules')
      .set(bearer(phone.deviceKey))
      .expect(200);

    expect(synced.body).toEqual([
      {
        id: kept.body.id,
        kind: 'WEEKLY',
        startAt: null,
        timeOfDay: '06:45',
        daysOfWeek: [6, 7],
        durationSeconds: 30,
        label: null,
      },
    ]);

    // The user's login is not a device key.
    await http.get('/device/schedules').set(bearer(token)).expect(401);
  });
});
