/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument --
   supertest response bodies are untyped by nature. */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { createFakePrisma } from './helpers/fake-prisma';

const MP3 = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(64, 1)]);

describe('Account settings (HTTP)', () => {
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

  const register = async (email: string, password = 'correct horse') =>
    (await http.post('/auth/register').send({ email, password }).expect(201))
      .body.accessToken as string;

  const login = (email: string, password: string) =>
    http.post('/auth/login').send({ email, password });

  describe('changing the password', () => {
    it('needs the current password, then only the new one logs in', async () => {
      const token = await register('change@example.com');

      await http
        .patch('/auth/password')
        .set(bearer(token))
        .send({
          currentPassword: 'correct horse',
          newPassword: 'battery staple',
        })
        .expect(204);

      await login('change@example.com', 'correct horse').expect(401);
      await login('change@example.com', 'battery staple').expect(200);
      // The session that changed it keeps working.
      await http.get('/auth/me').set(bearer(token)).expect(200);
    });

    it('answers a wrong current password with 403, not a logout-causing 401', async () => {
      const token = await register('wrong-current@example.com');

      const response = await http
        .patch('/auth/password')
        .set(bearer(token))
        .send({ currentPassword: 'not it', newPassword: 'battery staple' })
        .expect(403);

      expect(response.body.message).toBe('Password is incorrect');
      await login('wrong-current@example.com', 'correct horse').expect(200);
    });

    it('applies the registration rules to the new password', async () => {
      const token = await register('rules@example.com');

      await http
        .patch('/auth/password')
        .set(bearer(token))
        .send({ currentPassword: 'correct horse', newPassword: 'short' })
        .expect(400);
      await http
        .patch('/auth/password')
        .send({ currentPassword: 'correct horse', newPassword: 'long enough' })
        .expect(401);
    });
  });

  describe('deleting the account', () => {
    it('deletes everything in it and signs its phones out', async () => {
      const token = await register('leaving@example.com');
      const phone = (
        await http
          .post('/devices')
          .set(bearer(token))
          .send({ name: 'Phone', platform: 'ANDROID' })
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
        .post('/ringtones')
        .set(bearer(token))
        .attach('file', MP3, 'bell.mp3')
        .expect(201);

      // Someone else's account is left alone.
      const otherToken = await register('staying@example.com');
      const otherPhone = (
        await http
          .post('/devices')
          .set(bearer(otherToken))
          .send({ name: 'Other', platform: 'ANDROID' })
          .expect(201)
      ).body;
      await http
        .post(`/devices/${otherPhone.id}/schedules`)
        .set(bearer(otherToken))
        .send({ kind: 'WEEKLY', timeOfDay: '08:00', daysOfWeek: [2] })
        .expect(201);

      await http
        .delete('/auth/me')
        .set(bearer(token))
        .send({ password: 'correct horse' })
        .expect(204);

      await http.get('/auth/me').set(bearer(token)).expect(401);
      await login('leaving@example.com', 'correct horse').expect(401);
      await http
        .get('/device/schedules')
        .set(bearer(phone.deviceKey))
        .expect(401);

      const otherSchedules = await http
        .get(`/devices/${otherPhone.id}/schedules`)
        .set(bearer(otherToken))
        .expect(200);
      expect(otherSchedules.body).toHaveLength(1);
      await http
        .get('/device/schedules')
        .set(bearer(otherPhone.deviceKey))
        .expect(200);

      // The email is free again.
      const again = await register('leaving@example.com');
      const devices = await http.get('/devices').set(bearer(again)).expect(200);
      const ringtones = await http
        .get('/ringtones')
        .set(bearer(again))
        .expect(200);
      expect(devices.body).toHaveLength(0);
      expect(ringtones.body).toHaveLength(0);
    });

    it('keeps the account when the password is wrong or missing', async () => {
      const token = await register('careful@example.com');

      await http
        .delete('/auth/me')
        .set(bearer(token))
        .send({ password: 'not it' })
        .expect(403);
      await http.delete('/auth/me').set(bearer(token)).send({}).expect(400);
      await http
        .delete('/auth/me')
        .send({ password: 'correct horse' })
        .expect(401);

      await http.get('/auth/me').set(bearer(token)).expect(200);
    });
  });
});
