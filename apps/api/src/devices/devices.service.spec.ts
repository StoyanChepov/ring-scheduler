import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
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
    },
  };

  beforeEach(async () => {
    jest.resetAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [DevicesService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(DevicesService);
  });

  it('only lists devices that belong to the given user', async () => {
    prisma.device.findMany.mockResolvedValue([]);

    await service.findAll('user-1');

    expect(prisma.device.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('creates a device owned by the given user', async () => {
    prisma.device.create.mockResolvedValue({ id: 'd1' });

    await service.create('user-1', { name: 'Pixel', platform: 'ANDROID' });

    expect(prisma.device.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        name: 'Pixel',
        platform: 'ANDROID',
      }),
    });
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
});
