/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return --
   supertest response bodies are untyped by nature. */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { createFakePrisma } from './helpers/fake-prisma';

describe('Device keys (HTTP)', () => {
  let app: INestApplication<App>;
  let http: ReturnType<typeof request>;
  let prisma: ReturnType<typeof createFakePrisma>;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'e2e-secret-that-is-comfortably-over-32-chars';
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    prisma = createFakePrisma();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
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

  const userToken = async (email: string) =>
    (
      await http
        .post('/auth/register')
        .send({ email, password: 'correct horse' })
        .expect(201)
    ).body.accessToken as string;

  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  const createPhone = async (token: string) =>
    (
      await http
        .post('/devices')
        .set(bearer(token))
        .send({ name: 'Phone', platform: 'ANDROID', fcmToken: 'fcm-1' })
        .expect(201)
    ).body;

  it('returns a key once on creation and never exposes its hash', async () => {
    const token = await userToken('keys@example.com');
    const phone = await createPhone(token);

    expect(phone.deviceKey).toMatch(/^dk_/);
    expect(phone).not.toHaveProperty('keyHash');

    const list = await http.get('/devices').set(bearer(token)).expect(200);
    expect(list.body[0]).not.toHaveProperty('keyHash');
    expect(list.body[0]).not.toHaveProperty('deviceKey');
  });

  it('lets the phone update its own token with its key', async () => {
    const phone = await createPhone(await userToken('own@example.com'));

    await http
      .patch('/device/token')
      .set(bearer(phone.deviceKey))
      .send({ fcmToken: 'fcm-2' })
      .expect(204);

    const stored = await prisma.device.findUnique({ where: { id: phone.id } });
    expect(stored.fcmToken).toBe('fcm-2');
  });

  it('rejects device routes without a valid device key', async () => {
    const token = await userToken('nokey@example.com');
    const body = { fcmToken: 'x' };

    await http.patch('/device/token').send(body).expect(401);
    await http
      .patch('/device/token')
      .set(bearer('dk_not-a-real-key'))
      .send(body)
      .expect(401);
    // A user login is not a device key.
    await http.patch('/device/token').set(bearer(token)).send(body).expect(401);
  });

  it('a device key is not a user login', async () => {
    const phone = await createPhone(await userToken('notuser@example.com'));

    await http.get('/devices').set(bearer(phone.deviceKey)).expect(401);
  });

  it('issuing a new key revokes the old one', async () => {
    const token = await userToken('rotate@example.com');
    const phone = await createPhone(token);

    const issued = await http
      .post(`/devices/${phone.id}/key`)
      .set(bearer(token))
      .expect(201);

    const body = { fcmToken: 'fcm-3' };
    await http
      .patch('/device/token')
      .set(bearer(phone.deviceKey))
      .send(body)
      .expect(401);
    await http
      .patch('/device/token')
      .set(bearer(issued.body.deviceKey))
      .send(body)
      .expect(204);
  });

  it('only the owner can issue a key for a device', async () => {
    const phone = await createPhone(await userToken('owner@example.com'));
    const other = await userToken('other@example.com');

    await http.post(`/devices/${phone.id}/key`).set(bearer(other)).expect(404);
  });
});
