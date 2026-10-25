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

describe('Renaming and removing a device (HTTP)', () => {
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
    return { token, phone };
  };

  it('removes the phone with its alarms and history, and revokes its key', async () => {
    const { token, phone } = await setup('remove@example.com');
    const keep = (
      await http
        .post('/devices')
        .set(bearer(token))
        .send({ name: 'Other phone', platform: 'ANDROID' })
        .expect(201)
    ).body;

    await http
      .post(`/devices/${phone.id}/schedules`)
      .set(bearer(token))
      .send({ kind: 'WEEKLY', timeOfDay: '07:00', daysOfWeek: [1] })
      .expect(201);
    await http
      .post(`/devices/${phone.id}/ring`)
      .set(bearer(token))
      .send({ durationSeconds: 5 })
      .expect(201);
    await http
      .post('/device/events')
      .set(bearer(phone.deviceKey))
      .send({
        events: [
          {
            id: randomUUID(),
            type: 'STARTED',
            source: 'COMMAND',
            occurredAt: new Date().toISOString(),
          },
        ],
      })
      .expect(200);

    await http.delete(`/devices/${phone.id}`).set(bearer(token)).expect(204);

    const list = await http.get('/devices').set(bearer(token)).expect(200);
    expect(list.body.map((d: { id: string }) => d.id)).toEqual([keep.id]);

    // Everything that hung off it is gone or unreachable...
    await http
      .get(`/devices/${phone.id}/schedules`)
      .set(bearer(token))
      .expect(404);
    await http
      .get(`/devices/${phone.id}/events`)
      .set(bearer(token))
      .expect(404);
    // ...and the phone's own key no longer works, which signs the app out.
    await http
      .get('/device/schedules')
      .set(bearer(phone.deviceKey))
      .expect(401);
    // Removing it again is a 404, not an error.
    await http.delete(`/devices/${phone.id}`).set(bearer(token)).expect(404);
  });

  it('renames a device, trimming the name', async () => {
    const { token, phone } = await setup('rename@example.com');

    const renamed = await http
      .patch(`/devices/${phone.id}`)
      .set(bearer(token))
      .send({ name: '  Kitchen phone  ' })
      .expect(200);

    expect(renamed.body.name).toBe('Kitchen phone');
    expect(renamed.body).not.toHaveProperty('keyHash');

    const list = await http.get('/devices').set(bearer(token)).expect(200);
    expect(list.body[0].name).toBe('Kitchen phone');
  });

  it('refuses blank or long names, and other users', async () => {
    const owner = await setup('rename-owner@example.com');
    const other = await setup('rename-other@example.com');
    const rename = (token: string, name: unknown) =>
      http
        .patch(`/devices/${owner.phone.id}`)
        .set(bearer(token))
        .send({ name });

    await rename(owner.token, '   ').expect(400);
    await rename(owner.token, 'x'.repeat(81)).expect(400);
    await rename(owner.token, 42).expect(400);
    await rename(other.token, 'Mine now').expect(404);
    await http
      .patch(`/devices/${owner.phone.id}`)
      .send({ name: 'No token' })
      .expect(401);

    const list = await http
      .get('/devices')
      .set(bearer(owner.token))
      .expect(200);
    expect(list.body[0].name).toBe('Phone');
  });

  it('only lets the owner remove a device', async () => {
    const owner = await setup('remove-owner@example.com');
    const other = await setup('remove-other@example.com');

    await http
      .delete(`/devices/${owner.phone.id}`)
      .set(bearer(other.token))
      .expect(404);
    await http.delete(`/devices/${owner.phone.id}`).expect(401);

    const list = await http
      .get('/devices')
      .set(bearer(owner.token))
      .expect(200);
    expect(list.body).toHaveLength(1);
  });
});
