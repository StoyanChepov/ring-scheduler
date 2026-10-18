import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { DevicesService } from './devices.service';

describe('DevicesService', () => {
  let service: DevicesService;

  const prisma = {
    device: {
      findMany: jest.fn(),
      create: jest.fn(),
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

  it('defaults the platform to MOCK', async () => {
    prisma.device.create.mockResolvedValue({ id: 'd1' });

    await service.create('user-1', { name: 'Test' });

    expect(prisma.device.create.mock.calls[0][0].data.platform).toBe('MOCK');
  });
});
