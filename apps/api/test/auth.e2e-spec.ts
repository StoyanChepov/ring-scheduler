/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await --
   supertest response bodies and the in-memory fake database are untyped by nature. */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { createFakePrisma } from './helpers/fake-prisma';

describe('Auth flow (HTTP)', () => {
  const SECRET = 'e2e-secret-that-is-comfortably-over-32-chars';
  let app: INestApplication<App>;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    process.env.JWT_SECRET = SECRET;
    jest.spyOn(console, 'log').mockImplementation(() => undefined);

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

  const register = (email: string, password = 'correct horse') =>
    http.post('/auth/register').send({ email, password });

  it('rejects protected routes without a token', async () => {
    await http.get('/devices').expect(401);
    await http.post(`/devices/${randomUUID()}/ring`).expect(401);
  });

  it('rejects a malformed or foreign-signed token', async () => {
    await http
      .get('/devices')
      .set('Authorization', 'Bearer not-a-token')
      .expect(401);

    const forged = await new JwtService({
      secret: 'some-other-secret',
    }).signAsync({ sub: randomUUID(), email: 'x@y.com' });
    await http
      .get('/devices')
      .set('Authorization', `Bearer ${forged}`)
      .expect(401);
  });

  it('rejects a validly signed token for a user that does not exist', async () => {
    const orphan = await new JwtService({ secret: SECRET }).signAsync({
      sub: randomUUID(),
      email: 'ghost@y.com',
    });

    await http
      .get('/devices')
      .set('Authorization', `Bearer ${orphan}`)
      .expect(401);
  });

  it('validates registration input', async () => {
    await register('not-an-email').expect(400);
    await register('short@example.com', 'short').expect(400);
  });

  it('registers, then logs in and reaches /auth/me with the token', async () => {
    const registered = await register('Alice@Example.com').expect(201);

    expect(registered.body.accessToken).toEqual(expect.any(String));
    expect(registered.body.user.email).toBe('alice@example.com');
    expect(JSON.stringify(registered.body)).not.toContain('passwordHash');

    const login = await http
      .post('/auth/login')
      .send({ email: 'alice@example.com', password: 'correct horse' })
      .expect(200);

    const me = await http
      .get('/auth/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(200);

    expect(me.body).toEqual({
      id: registered.body.user.id,
      email: 'alice@example.com',
    });
  });

  it('refuses duplicate emails regardless of case', async () => {
    await register('dupe@example.com').expect(201);
    await register('DUPE@example.com').expect(409);
  });

  it('gives the same 401 for a wrong password and an unknown email', async () => {
    await register('bob@example.com').expect(201);

    const wrongPassword = await http
      .post('/auth/login')
      .send({ email: 'bob@example.com', password: 'wrong password' })
      .expect(401);
    const unknownEmail = await http
      .post('/auth/login')
      .send({ email: 'nobody@example.com', password: 'wrong password' })
      .expect(401);

    expect(wrongPassword.body.message).toBe(unknownEmail.body.message);
  });

  it('keeps each user’s devices and commands separate', async () => {
    const a = (await register('carol@example.com')).body.accessToken;
    const b = (await register('dave@example.com')).body.accessToken;
    const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

    const created = await http
      .post('/devices')
      .set(auth(a))
      .send({ name: 'Carol phone' })
      .expect(201);
    const deviceId = created.body.id;

    const listA = await http.get('/devices').set(auth(a)).expect(200);
    const listB = await http.get('/devices').set(auth(b)).expect(200);
    expect(listA.body).toHaveLength(1);
    expect(listB.body).toHaveLength(0);

    // Another user's device looks exactly like a device that doesn't exist.
    await http
      .post(`/devices/${deviceId}/ring`)
      .set(auth(b))
      .send({ durationSeconds: 10 })
      .expect(404);
    await http.post(`/devices/${deviceId}/stop`).set(auth(b)).expect(404);

    const rung = await http
      .post(`/devices/${deviceId}/ring`)
      .set(auth(a))
      .send({ durationSeconds: 10 })
      .expect(201);
    expect(rung.body.type).toBe('RING_START');
    expect(rung.body.userId).toBe(created.body.userId);

    await http.post(`/devices/${deviceId}/stop`).set(auth(a)).expect(201);
  });

  it('answers a non-UUID device id with 400 instead of a database lookup', async () => {
    const token = (await register('erin@example.com')).body.accessToken;

    await http
      .post('/devices/not-a-uuid/ring')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });
});
