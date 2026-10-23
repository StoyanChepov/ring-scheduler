/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access --
   jest.fn() mock calls are untyped by nature. */
import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { hashDeviceKey } from '../device-auth/device-key';
import { FirebaseService } from '../firebase/firebase.service';
import { PrismaService } from '../prisma/prisma.service';
import { DevicesService } from './devices.service';

describe('DevicesService', () => {
  let service: DevicesService;

  const prisma = {
    device: {
      findMany: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.resetAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DevicesService,
        { provide: PrismaService, useValue: prisma },
        { provide: FirebaseService, useValue: { isEnabled: false } },
      ],
    }).compile();

    service = module.get(DevicesService);
  });

  it('only lists devices that belong to the given user', async () => {
    prisma.device.findMany.mockResolvedValue([]);

    await service.findAll('user-1');

    expect(prisma.device.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      orderBy: { createdAt: 'desc' },
      omit: { keyHash: true },
    });
  });

  it('creates a device owned by the given user', async () => {
    prisma.device.create.mockResolvedValue({ id: 'd1' });

    await service.create('user-1', { name: 'Pixel', platform: 'ANDROID' });

    expect(prisma.device.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-1',
          name: 'Pixel',
          platform: 'ANDROID',
        }),
      }),
    );
  });

  describe('updateToken', () => {
    it('updates the token only for a device the user owns', async () => {
      prisma.device.updateMany.mockResolvedValue({ count: 1 });
      prisma.device.findFirst.mockResolvedValue({ id: 'd1', fcmToken: 'new' });

      const result = await service.updateToken('user-1', 'd1', 'new');

      expect(prisma.device.updateMany).toHaveBeenCalledWith({
        where: { id: 'd1', userId: 'user-1' },
        data: { fcmToken: 'new', lastSeenAt: expect.any(Date) },
      });
      expect(result).toEqual({ id: 'd1', fcmToken: 'new' });
    });

    it('reports 404 for a device that is missing or belongs to someone else', async () => {
      prisma.device.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.updateToken('user-1', 'not-mine', 'new'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.device.findFirst).not.toHaveBeenCalled();
    });
  });

  it('defaults the platform to MOCK', async () => {
    prisma.device.create.mockResolvedValue({ id: 'd1' });

    await service.create('user-1', { name: 'Test' });

    expect(prisma.device.create.mock.calls[0][0].data.platform).toBe('MOCK');
  });

  describe('device keys', () => {
    it('gives a new Android device a key and stores only its hash', async () => {
      prisma.device.create.mockResolvedValue({ id: 'd1' });

      const result = await service.create('user-1', {
        name: 'Pixel',
        platform: 'ANDROID',
      });
      const { deviceKey } = result as { deviceKey: string };

      expect(deviceKey).toMatch(/^dk_[A-Za-z0-9_-]{43}$/);
      const { data, omit } = prisma.device.create.mock.calls[0][0];
      expect(data.keyHash).toBe(hashDeviceKey(deviceKey));
      expect(data).not.toHaveProperty('deviceKey');
      expect(omit).toEqual({ keyHash: true });
    });

    it('does not give mock devices a key', async () => {
      prisma.device.create.mockResolvedValue({ id: 'd1' });

      const result = await service.create('user-1', { name: 'Test' });

      expect(result).not.toHaveProperty('deviceKey');
      expect(prisma.device.create.mock.calls[0][0].data).not.toHaveProperty(
        'keyHash',
      );
    });

    it('replaces the key only on a device the user owns', async () => {
      prisma.device.updateMany.mockResolvedValue({ count: 1 });

      const { deviceKey } = await service.issueKey('user-1', 'd1');

      expect(prisma.device.updateMany).toHaveBeenCalledWith({
        where: { id: 'd1', userId: 'user-1' },
        data: { keyHash: hashDeviceKey(deviceKey) },
      });
    });

    it('reports 404 when issuing a key for someone else’s device', async () => {
      prisma.device.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.issueKey('user-1', 'not-mine'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('issues a different key every time', async () => {
      prisma.device.updateMany.mockResolvedValue({ count: 1 });

      const first = await service.issueKey('user-1', 'd1');
      const second = await service.issueKey('user-1', 'd1');

      expect(first.deviceKey).not.toBe(second.deviceKey);
    });
  });
});
