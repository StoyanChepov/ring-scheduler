/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument --
   jest.fn() mock calls are untyped by nature. */
import { ConfigService } from '@nestjs/config';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { FirebaseService } from './firebase.service';

jest.mock('firebase-admin/app', () => ({
  initializeApp: jest.fn(),
  getApps: jest.fn(),
  cert: jest.fn((account: unknown) => ({ cert: account })),
}));
jest.mock('firebase-admin/messaging', () => ({ getMessaging: jest.fn() }));

const ACCOUNT = {
  project_id: 'demo-project',
  client_email: 'svc@demo-project.iam.gserviceaccount.com',
  private_key: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n',
};

function createService(env: Record<string, string | undefined>) {
  const config = { get: (key: string) => env[key] } as unknown as ConfigService;
  const service = new FirebaseService(config);
  jest.spyOn(service['logger'], 'log').mockImplementation(() => undefined);
  jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);
  return service;
}

describe('FirebaseService', () => {
  const send = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getApps).mockReturnValue([]);
    jest
      .mocked(initializeApp)
      .mockReturnValue({ name: 'ring-scheduler' } as never);
    jest.mocked(getMessaging).mockReturnValue({ send } as never);
  });

  describe('configuration', () => {
    it('stays disabled, without throwing, when no credentials are set', async () => {
      const service = createService({});

      service.onModuleInit();

      expect(service.isEnabled).toBe(false);
      expect(initializeApp).not.toHaveBeenCalled();

      await expect(
        service.sendRingCommand('token', {
          commandId: 'c1',
          type: 'RING_START',
        }),
      ).resolves.toMatchObject({ status: 'failed', invalidToken: false });
      expect(send).not.toHaveBeenCalled();
    });

    it('initialises from inline JSON', () => {
      const service = createService({
        FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify(ACCOUNT),
      });

      service.onModuleInit();

      expect(service.isEnabled).toBe(true);
      expect(initializeApp).toHaveBeenCalledWith(
        expect.anything(),
        'ring-scheduler',
      );
    });

    it('initialises from a key file path', () => {
      const dir = mkdtempSync(join(tmpdir(), 'fb-'));
      const file = join(dir, 'account.json');
      writeFileSync(file, JSON.stringify(ACCOUNT));

      try {
        const service = createService({ FIREBASE_SERVICE_ACCOUNT_PATH: file });

        service.onModuleInit();

        expect(service.isEnabled).toBe(true);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('reuses an app that is already initialised', () => {
      jest
        .mocked(getApps)
        .mockReturnValue([{ name: 'ring-scheduler' }] as never);
      const service = createService({
        FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify(ACCOUNT),
      });

      service.onModuleInit();

      expect(service.isEnabled).toBe(true);
      expect(initializeApp).not.toHaveBeenCalled();
    });

    it('fails startup on invalid JSON instead of silently falling back to mock', () => {
      const service = createService({ FIREBASE_SERVICE_ACCOUNT_JSON: '{nope' });

      expect(() => service.onModuleInit()).toThrow(/not valid JSON/);
    });

    it('fails startup when the key file is missing', () => {
      const service = createService({
        FIREBASE_SERVICE_ACCOUNT_PATH: '/definitely/not/here.json',
      });

      expect(() => service.onModuleInit()).toThrow(/missing or not valid JSON/);
    });

    it('fails startup when required fields are missing, without echoing the key', () => {
      const service = createService({
        FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({
          project_id: 'p',
          private_key: 'SECRET-KEY-MATERIAL',
        }),
      });

      expect(() => service.onModuleInit()).toThrow(/client_email/);
      expect(() => service.onModuleInit()).not.toThrow(/SECRET-KEY-MATERIAL/);
    });
  });

  describe('sendRingCommand', () => {
    let service: FirebaseService;

    beforeEach(() => {
      service = createService({
        FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify(ACCOUNT),
      });
      service.onModuleInit();
    });

    it('sends a high-priority data-only message with string values', async () => {
      send.mockResolvedValue('projects/demo/messages/1');

      const outcome = await service.sendRingCommand('device-token', {
        commandId: 'cmd-1',
        type: 'RING_START',
        durationSeconds: 45,
      });

      expect(outcome).toEqual({
        status: 'sent',
        messageId: 'projects/demo/messages/1',
      });

      const message = send.mock.calls[0][0];
      expect(message.token).toBe('device-token');
      expect(message.notification).toBeUndefined();
      expect(message.data).toMatchObject({
        type: 'RING_START',
        commandId: 'cmd-1',
        durationSeconds: '45',
      });
      expect(
        Object.values(message.data).every((v) => typeof v === 'string'),
      ).toBe(true);
      expect(message.android).toMatchObject({
        priority: 'high',
        ttl: 60_000,
        collapseKey: 'ring-command',
      });
    });

    it('omits durationSeconds for a stop command', async () => {
      send.mockResolvedValue('id');

      await service.sendRingCommand('t', { commandId: 'c', type: 'RING_STOP' });

      expect(send.mock.calls[0][0].data).not.toHaveProperty('durationSeconds');
    });

    it.each([
      'messaging/registration-token-not-registered',
      'messaging/invalid-registration-token',
    ])('flags %s as a dead token', async (code) => {
      send.mockRejectedValue({ code });

      await expect(
        service.sendRingCommand('t', { commandId: 'c', type: 'RING_START' }),
      ).resolves.toMatchObject({ status: 'failed', invalidToken: true });
    });

    it.each([
      'messaging/mismatched-credential',
      'messaging/server-unavailable',
      'messaging/internal-error',
    ])('does not flag %s as a dead token', async (code) => {
      send.mockRejectedValue({ code });

      const outcome = await service.sendRingCommand('t', {
        commandId: 'c',
        type: 'RING_START',
      });

      expect(outcome).toMatchObject({ status: 'failed', invalidToken: false });
      expect((outcome as { reason: string }).reason).toContain(code);
    });

    it('turns an unexpected error into a failed outcome instead of throwing', async () => {
      send.mockRejectedValue(new Error('socket hang up'));

      await expect(
        service.sendRingCommand('t', { commandId: 'c', type: 'RING_START' }),
      ).resolves.toMatchObject({ status: 'failed', invalidToken: false });
    });
  });

  describe('sendSchedulesChanged', () => {
    it('sends a data-only nudge that collapses and outlives a ring command', async () => {
      const service = createService({
        FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify(ACCOUNT),
      });
      service.onModuleInit();
      send.mockResolvedValue('projects/demo/messages/2');

      await expect(
        service.sendSchedulesChanged('device-token'),
      ).resolves.toEqual({
        status: 'sent',
        messageId: 'projects/demo/messages/2',
      });

      const message = send.mock.calls[0][0];
      expect(message.token).toBe('device-token');
      expect(message.notification).toBeUndefined();
      expect(message.data.type).toBe('SCHEDULES_CHANGED');
      expect(message.android).toMatchObject({
        priority: 'high',
        collapseKey: 'schedules-changed',
      });
      expect(message.android.ttl).toBeGreaterThan(60_000);
    });

    it('reports a dead token like a ring command does', async () => {
      const service = createService({
        FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify(ACCOUNT),
      });
      service.onModuleInit();
      send.mockRejectedValue({
        code: 'messaging/registration-token-not-registered',
      });

      await expect(service.sendSchedulesChanged('t')).resolves.toMatchObject({
        status: 'failed',
        invalidToken: true,
      });
    });

    it('fails without calling FCM when push is not configured', async () => {
      const service = createService({});
      service.onModuleInit();

      await expect(service.sendSchedulesChanged('t')).resolves.toMatchObject({
        status: 'failed',
      });
      expect(send).not.toHaveBeenCalled();
    });
  });

  describe('checkCredentials', () => {
    it('reports missing credentials without calling FCM', async () => {
      const service = createService({});
      service.onModuleInit();

      const result = await service.checkCredentials();

      expect(result.ok).toBe(false);
      expect(result.detail).toMatch(/FIREBASE_SERVICE_ACCOUNT/);
      expect(send).not.toHaveBeenCalled();
    });

    describe('with credentials', () => {
      let service: FirebaseService;

      beforeEach(() => {
        service = createService({
          FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify(ACCOUNT),
        });
        service.onModuleInit();
      });

      it('only validates the message (dry run) and never delivers it', async () => {
        send.mockResolvedValue('projects/demo/messages/dry');

        await service.checkCredentials();

        expect(send).toHaveBeenCalledTimes(1);
        expect(send.mock.calls[0][1]).toBe(true);
        expect(send.mock.calls[0][0].token).not.toMatch(
          /^[A-Za-z0-9_-]{100,}$/,
        );
      });

      it('passes when FCM accepts the message', async () => {
        send.mockResolvedValue('projects/demo/messages/dry');

        await expect(service.checkCredentials()).resolves.toMatchObject({
          ok: true,
        });
      });

      it.each([
        'messaging/invalid-argument',
        'messaging/invalid-registration-token',
        'messaging/registration-token-not-registered',
      ])('passes when FCM only rejects the fake token (%s)', async (code) => {
        send.mockRejectedValue({ code });

        const result = await service.checkCredentials();

        expect(result.ok).toBe(true);
        expect(result.detail).toContain('demo-project');
        expect(result.detail).toContain(code);
      });

      it.each([
        'messaging/mismatched-credential',
        'messaging/authentication-error',
        'messaging/third-party-auth-error',
        'app/network-error',
      ])('fails on %s and names the code', async (code) => {
        send.mockRejectedValue({ code });

        const result = await service.checkCredentials();

        expect(result.ok).toBe(false);
        expect(result.detail).toContain(code);
      });

      it('fails, rather than throwing, on an error with no code', async () => {
        send.mockRejectedValue(new Error('socket hang up'));

        await expect(service.checkCredentials()).resolves.toMatchObject({
          ok: false,
          detail: expect.stringContaining('unknown'),
        });
      });
    });
  });
});
