/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument --
   supertest response bodies are untyped by nature. */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { createFakePrisma } from './helpers/fake-prisma';

// Just enough bytes for each format's signature.
const MP3 = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(64, 1)]);
const WAV = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.alloc(4),
  Buffer.from('WAVE'),
  Buffer.alloc(64, 2),
]);

describe('Ringtones (HTTP)', () => {
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

  const upload = (token: string, file: Buffer, filename = 'bell.mp3') =>
    http.post('/ringtones').set(bearer(token)).attach('file', file, filename);

  it('uploads, lists without the audio, and serves it back', async () => {
    const { token, phone } = await setup('tones@example.com');

    const created = await upload(token, MP3, 'Morning bell.mp3').expect(201);
    expect(created.body).toMatchObject({
      name: 'Morning bell',
      mimeType: 'audio/mpeg',
      sizeBytes: MP3.length,
    });
    expect(created.body).not.toHaveProperty('data');

    const list = await http.get('/ringtones').set(bearer(token)).expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).not.toHaveProperty('data');

    // The phone downloads it with its device key...
    const onPhone = await http
      .get(`/device/ringtones/${created.body.id}`)
      .set(bearer(phone.deviceKey))
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => done(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(onPhone.headers['content-type']).toBe('audio/mpeg');
    expect(Buffer.compare(onPhone.body, MP3)).toBe(0);

    // ...and the owner can preview it.
    await http
      .get(`/ringtones/${created.body.id}/file`)
      .set(bearer(token))
      .expect(200);
  });

  it('names the ringtone from the form field when given', async () => {
    const { token } = await setup('named@example.com');

    const created = await http
      .post('/ringtones')
      .set(bearer(token))
      .field('name', 'Ship horn')
      .attach('file', WAV, 'horn.wav')
      .expect(201);

    expect(created.body).toMatchObject({
      name: 'Ship horn',
      mimeType: 'audio/wav',
    });
  });

  it('only accepts real audio, whatever the file is called', async () => {
    const { token } = await setup('fake-audio@example.com');

    await upload(token, Buffer.from('<html>not audio</html>'), 'x.mp3').expect(
      400,
    );
    await http.post('/ringtones').set(bearer(token)).expect(400);
  });

  it('refuses files over 1 MB', async () => {
    const { token } = await setup('big@example.com');
    const big = Buffer.concat([MP3, Buffer.alloc(1024 * 1024)]);

    await upload(token, big).expect(413);
  });

  it('caps each user at 10 ringtones', async () => {
    const { token } = await setup('many@example.com');

    for (let i = 0; i < 10; i++) {
      await upload(token, MP3).expect(201);
    }
    await upload(token, MP3).expect(400);
  });

  it('keeps ringtones private to their owner and their phones', async () => {
    const owner = await setup('tone-owner@example.com');
    const other = await setup('tone-other@example.com');
    const tone = (await upload(owner.token, MP3).expect(201)).body;

    await http
      .get(`/ringtones/${tone.id}/file`)
      .set(bearer(other.token))
      .expect(404);
    await http
      .get(`/device/ringtones/${tone.id}`)
      .set(bearer(other.phone.deviceKey))
      .expect(404);
    await http
      .delete(`/ringtones/${tone.id}`)
      .set(bearer(other.token))
      .expect(404);

    // Nor can someone use another user's ringtone for their alarms.
    await http
      .post(`/devices/${other.phone.id}/schedules`)
      .set(bearer(other.token))
      .send({
        kind: 'WEEKLY',
        timeOfDay: '07:00',
        daysOfWeek: [1],
        ringtoneId: tone.id,
      })
      .expect(400);
  });

  it('uses a ringtone for an alarm, and falls back when it is deleted', async () => {
    const { token, phone } = await setup('tone-alarm@example.com');
    const tone = (await upload(token, MP3).expect(201)).body;

    await http
      .post(`/devices/${phone.id}/schedules`)
      .set(bearer(token))
      .send({
        kind: 'WEEKLY',
        timeOfDay: '07:00',
        daysOfWeek: [1],
        ringtoneId: tone.id,
      })
      .expect(201);

    const before = await http
      .get('/device/schedules')
      .set(bearer(phone.deviceKey))
      .expect(200);
    expect(before.body[0].ringtoneId).toBe(tone.id);

    await http.delete(`/ringtones/${tone.id}`).set(bearer(token)).expect(204);

    const after = await http
      .get('/device/schedules')
      .set(bearer(phone.deviceKey))
      .expect(200);
    expect(after.body[0].ringtoneId).toBeNull();
  });
});
