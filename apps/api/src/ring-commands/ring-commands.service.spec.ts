import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { FirebaseService } from '../firebase/firebase.service';
import { PrismaService } from '../prisma/prisma.service';
import { RingCommandsService } from './ring-commands.service';

describe('RingCommandsService', () => {
  let service: RingCommandsService;

  const prisma = {
    device: { findFirst: jest.fn(), update: jest.fn() },
    ringCommand: { create: jest.fn(), update: jest.fn() },
  };
  const firebase = { isEnabled: true, sendRingCommand: jest.fn() };

  const mockDevice = {
    id: 'device-1',
    name: 'Test phone',
    platform: 'MOCK',
    fcmToken: null,
  };
  const androidDevice = {
    id: 'device-1',
    name: 'Pixel',
    platform: 'ANDROID',
    fcmToken: 'fcm-token-1',
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    firebase.isEnabled = true;
    prisma.ringCommand.create.mockResolvedValue({ id: 'cmd-1' });
    // Echo the update back so the returned command reflects the new status.
    prisma.ringCommand.update.mockImplementation(({ data }) =>
      Promise.resolve({ id: 'cmd-1', ...data }),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RingCommandsService,
        { provide: PrismaService, useValue: prisma },
        { provide: FirebaseService, useValue: firebase },
      ],
    }).compile();

    module.useLogger(false);
    service = module.get(RingCommandsService);
  });

  it('looks the device up by owner, so other users cannot ring it', async () => {
    prisma.device.findFirst.mockResolvedValue(null);

    await expect(
      service.ringDevice('user-1', 'device-1', { durationSeconds: 30 }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.device.findFirst).toHaveBeenCalledWith({
      where: { id: 'device-1', userId: 'user-1' },
    });
    expect(prisma.ringCommand.create).not.toHaveBeenCalled();
    expect(firebase.sendRingCommand).not.toHaveBeenCalled();
  });

  it('refuses to stop a device the user does not own', async () => {
    prisma.device.findFirst.mockResolvedValue(null);

    await expect(
      service.stopDevice('user-1', 'someone-elses-device'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  describe('MOCK devices', () => {
    beforeEach(() => prisma.device.findFirst.mockResolvedValue(mockDevice));

    it('are marked SENT without touching Firebase', async () => {
      const result = await service.ringDevice('user-1', 'device-1', {
        durationSeconds: 45,
      });

      expect(prisma.ringCommand.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          deviceId: 'device-1',
          type: 'RING_START',
          status: 'CREATED',
          durationSeconds: 45,
        },
      });
      expect(firebase.sendRingCommand).not.toHaveBeenCalled();
      expect(result.status).toBe('SENT');
      expect(result.delivery).toMatchObject({ mode: 'mock', delivered: true });
    });

    it('store a stop command without a duration', async () => {
      await service.stopDevice('user-1', 'device-1');

      const { data } = prisma.ringCommand.create.mock.calls[0][0];
      expect(data.type).toBe('RING_STOP');
      expect(data).not.toHaveProperty('durationSeconds');
    });
  });

  describe('real devices', () => {
    beforeEach(() => prisma.device.findFirst.mockResolvedValue(androidDevice));

    it('push the command through FCM and mark it SENT', async () => {
      firebase.sendRingCommand.mockResolvedValue({
        status: 'sent',
        messageId: 'm1',
      });

      const result = await service.ringDevice('user-1', 'device-1', {
        durationSeconds: 20,
      });

      expect(firebase.sendRingCommand).toHaveBeenCalledWith('fcm-token-1', {
        commandId: 'cmd-1',
        type: 'RING_START',
        durationSeconds: 20,
      });
      expect(prisma.ringCommand.update).toHaveBeenCalledWith({
        where: { id: 'cmd-1' },
        data: { status: 'SENT' },
      });
      expect(result.delivery).toMatchObject({ mode: 'fcm', delivered: true });
    });

    it('push a stop command through FCM', async () => {
      firebase.sendRingCommand.mockResolvedValue({
        status: 'sent',
        messageId: 'm2',
      });

      await service.stopDevice('user-1', 'device-1');

      expect(firebase.sendRingCommand).toHaveBeenCalledWith(
        'fcm-token-1',
        expect.objectContaining({ type: 'RING_STOP' }),
      );
    });

    it('are marked FAILED, without calling FCM, when they have no token', async () => {
      prisma.device.findFirst.mockResolvedValue({
        ...androidDevice,
        fcmToken: null,
      });

      const result = await service.ringDevice('user-1', 'device-1', {
        durationSeconds: 30,
      });

      expect(firebase.sendRingCommand).not.toHaveBeenCalled();
      expect(result.status).toBe('FAILED');
      expect(result.delivery.delivered).toBe(false);
      expect(result.delivery.message).toContain('no push token');
    });

    it('are marked FAILED when Firebase is not configured', async () => {
      firebase.isEnabled = false;

      const result = await service.ringDevice('user-1', 'device-1', {
        durationSeconds: 30,
      });

      expect(firebase.sendRingCommand).not.toHaveBeenCalled();
      expect(result.status).toBe('FAILED');
      expect(result.delivery.message).toContain('not configured');
    });

    it('are marked FAILED on a transient FCM error and keep their token', async () => {
      firebase.sendRingCommand.mockResolvedValue({
        status: 'failed',
        reason: 'Push delivery failed (messaging/server-unavailable)',
        invalidToken: false,
      });

      const result = await service.ringDevice('user-1', 'device-1', {
        durationSeconds: 30,
      });

      expect(result.status).toBe('FAILED');
      expect(result.delivery.message).toContain('server-unavailable');
      expect(prisma.device.update).not.toHaveBeenCalled();
    });

    it('lose a dead token so it is not tried again', async () => {
      firebase.sendRingCommand.mockResolvedValue({
        status: 'failed',
        reason: 'The device push token is no longer valid',
        invalidToken: true,
      });

      const result = await service.ringDevice('user-1', 'device-1', {
        durationSeconds: 30,
      });

      expect(prisma.device.update).toHaveBeenCalledWith({
        where: { id: 'device-1' },
        data: { fcmToken: null },
      });
      expect(result.status).toBe('FAILED');
      expect(result.delivery.message).toContain('register again');
    });
  });
});
