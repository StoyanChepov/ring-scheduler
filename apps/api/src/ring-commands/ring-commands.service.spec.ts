import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { RingCommandsService } from './ring-commands.service';

describe('RingCommandsService', () => {
  let service: RingCommandsService;

  const prisma = {
    device: { findFirst: jest.fn() },
    ringCommand: { create: jest.fn() },
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RingCommandsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(RingCommandsService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
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
  });

  it('stores a RING_START command for the user', async () => {
    prisma.device.findFirst.mockResolvedValue({
      id: 'device-1',
      name: 'Pixel',
    });
    prisma.ringCommand.create.mockResolvedValue({ id: 'c1' });

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
    expect(result.mockDelivery.delivered).toBe(true);
  });

  it('stores a RING_STOP command for the user', async () => {
    prisma.device.findFirst.mockResolvedValue({
      id: 'device-1',
      name: 'Pixel',
    });
    prisma.ringCommand.create.mockResolvedValue({ id: 'c2' });

    await service.stopDevice('user-1', 'device-1');

    expect(prisma.ringCommand.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        deviceId: 'device-1',
        type: 'RING_STOP',
        status: 'CREATED',
      },
    });
  });

  it('refuses to stop a device the user does not own', async () => {
    prisma.device.findFirst.mockResolvedValue(null);

    await expect(
      service.stopDevice('user-1', 'someone-elses-device'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
