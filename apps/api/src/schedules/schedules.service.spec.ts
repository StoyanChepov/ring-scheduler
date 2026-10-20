/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return --
   jest.fn() mock calls are untyped by nature. */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { FirebaseService } from '../firebase/firebase.service';
import { PrismaService } from '../prisma/prisma.service';
import { RingtonesService } from '../ringtones/ringtones.service';
import { SchedulesService } from './schedules.service';

describe('SchedulesService', () => {
  let service: SchedulesService;

  const prisma = {
    device: { findFirst: jest.fn() },
    ringSchedule: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
  };
  const firebase = {
    isEnabled: true,
    sendSchedulesChanged: jest.fn(),
  };
  const ringtones = { assertOwned: jest.fn() };

  const phone = { id: 'd1', platform: 'ANDROID', fcmToken: 'fcm-1' };
  const inAnHour = () => new Date(Date.now() + 3_600_000).toISOString();

  beforeEach(async () => {
    jest.resetAllMocks();
    firebase.isEnabled = true;
    prisma.device.findFirst.mockResolvedValue(phone);
    prisma.ringSchedule.count.mockResolvedValue(0);
    prisma.ringSchedule.create.mockImplementation(({ data }) => ({
      id: 's1',
      ...data,
    }));
    firebase.sendSchedulesChanged.mockResolvedValue({
      status: 'sent',
      messageId: 'm1',
    });

    const module = await Test.createTestingModule({
      providers: [
        SchedulesService,
        { provide: PrismaService, useValue: prisma },
        { provide: FirebaseService, useValue: firebase },
        { provide: RingtonesService, useValue: ringtones },
      ],
    }).compile();

    service = module.get(SchedulesService);
    jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);
  });

  describe('create', () => {
    it('stores a one-time alarm and tells the phone to sync', async () => {
      const startAt = inAnHour();

      await service.create('user-1', 'd1', {
        kind: 'ONE_TIME',
        startAt,
        durationSeconds: 20,
      });

      expect(prisma.device.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'd1', userId: 'user-1' } }),
      );
      expect(prisma.ringSchedule.create.mock.calls[0][0].data).toEqual({
        deviceId: 'd1',
        kind: 'ONE_TIME',
        label: undefined,
        durationSeconds: 20,
        startAt: new Date(startAt),
        daysOfWeek: [],
      });
      expect(firebase.sendSchedulesChanged).toHaveBeenCalledWith('fcm-1');
    });

    it('stores a weekly alarm with its days sorted and no startAt', async () => {
      await service.create('user-1', 'd1', {
        kind: 'WEEKLY',
        timeOfDay: '07:30',
        daysOfWeek: [5, 1, 3],
        durationSeconds: 30,
        // Sent by mistake; must not be stored on a weekly alarm.
        startAt: inAnHour(),
      });

      const { data } = prisma.ringSchedule.create.mock.calls[0][0];
      expect(data.daysOfWeek).toEqual([1, 3, 5]);
      expect(data.timeOfDay).toBe('07:30');
      expect(data).not.toHaveProperty('startAt');
    });

    it('refuses a one-time alarm in the past', async () => {
      await expect(
        service.create('user-1', 'd1', {
          kind: 'ONE_TIME',
          startAt: new Date(Date.now() - 1000).toISOString(),
          durationSeconds: 30,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.ringSchedule.create).not.toHaveBeenCalled();
    });

    it('checks that a chosen ringtone belongs to the user', async () => {
      const ringtoneId = '11111111-1111-4111-8111-111111111111';

      await service.create('user-1', 'd1', {
        kind: 'ONE_TIME',
        startAt: inAnHour(),
        durationSeconds: 30,
        ringtoneId,
      });

      expect(ringtones.assertOwned).toHaveBeenCalledWith('user-1', ringtoneId);
      expect(prisma.ringSchedule.create.mock.calls[0][0].data.ringtoneId).toBe(
        ringtoneId,
      );
    });

    it('refuses someone else’s ringtone before saving anything', async () => {
      ringtones.assertOwned.mockRejectedValue(
        new BadRequestException('Unknown ringtone'),
      );

      await expect(
        service.create('user-1', 'd1', {
          kind: 'ONE_TIME',
          startAt: inAnHour(),
          durationSeconds: 30,
          ringtoneId: '22222222-2222-4222-8222-222222222222',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.ringSchedule.create).not.toHaveBeenCalled();
    });

    it('caps the number of schedules per device', async () => {
      prisma.ringSchedule.count.mockResolvedValue(50);

      await expect(
        service.create('user-1', 'd1', {
          kind: 'ONE_TIME',
          startAt: inAnHour(),
          durationSeconds: 30,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('reports 404 for a device the user does not own', async () => {
      prisma.device.findFirst.mockResolvedValue(null);

      await expect(
        service.create('user-1', 'not-mine', {
          kind: 'ONE_TIME',
          startAt: inAnHour(),
          durationSeconds: 30,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('still saves the schedule when the push fails', async () => {
      firebase.sendSchedulesChanged.mockResolvedValue({
        status: 'failed',
        reason: 'Push delivery failed (messaging/internal-error)',
        invalidToken: false,
      });

      await expect(
        service.create('user-1', 'd1', {
          kind: 'ONE_TIME',
          startAt: inAnHour(),
          durationSeconds: 30,
        }),
      ).resolves.toMatchObject({ id: 's1' });
    });

    it.each([
      ['a mock device', { ...phone, platform: 'MOCK' }],
      ['a phone without a push token', { ...phone, fcmToken: null }],
    ])('does not push to %s', async (_name, device) => {
      prisma.device.findFirst.mockResolvedValue(device);

      await service.create('user-1', 'd1', {
        kind: 'ONE_TIME',
        startAt: inAnHour(),
        durationSeconds: 30,
      });

      expect(firebase.sendSchedulesChanged).not.toHaveBeenCalled();
    });

    it('does not push when push is not configured', async () => {
      firebase.isEnabled = false;

      await service.create('user-1', 'd1', {
        kind: 'ONE_TIME',
        startAt: inAnHour(),
        durationSeconds: 30,
      });

      expect(firebase.sendSchedulesChanged).not.toHaveBeenCalled();
    });
  });

  describe('update and remove', () => {
    it('only changes a schedule that belongs to the given device', async () => {
      prisma.ringSchedule.updateMany.mockResolvedValue({ count: 1 });

      await service.update('user-1', 'd1', 's1', { isActive: false });

      expect(prisma.ringSchedule.updateMany).toHaveBeenCalledWith({
        where: { id: 's1', deviceId: 'd1' },
        data: { isActive: false },
      });
      expect(firebase.sendSchedulesChanged).toHaveBeenCalled();
    });

    it('reports 404 for a schedule on another device', async () => {
      prisma.ringSchedule.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.update('user-1', 'd1', 'elsewhere', { isActive: false }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(firebase.sendSchedulesChanged).not.toHaveBeenCalled();
    });

    it('deletes only within the device and tells the phone', async () => {
      prisma.ringSchedule.deleteMany.mockResolvedValue({ count: 1 });

      await service.remove('user-1', 'd1', 's1');

      expect(prisma.ringSchedule.deleteMany).toHaveBeenCalledWith({
        where: { id: 's1', deviceId: 'd1' },
      });
      expect(firebase.sendSchedulesChanged).toHaveBeenCalled();
    });

    it('reports 404 when there is nothing to delete', async () => {
      prisma.ringSchedule.deleteMany.mockResolvedValue({ count: 0 });

      await expect(
        service.remove('user-1', 'd1', 'gone'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('listForDevice', () => {
    it('asks only for active weekly or upcoming one-time alarms', async () => {
      prisma.ringSchedule.findMany.mockResolvedValue([]);

      await service.listForDevice('d1');

      const { where } = prisma.ringSchedule.findMany.mock.calls[0][0];
      expect(where.deviceId).toBe('d1');
      expect(where.isActive).toBe(true);
      expect(where.OR).toEqual([
        { kind: 'WEEKLY' },
        { startAt: { gt: expect.any(Date) } },
      ]);
    });

    it('returns just what the phone needs, with ISO dates', async () => {
      const startAt = new Date('2030-01-01T07:00:00.000Z');
      prisma.ringSchedule.findMany.mockResolvedValue([
        {
          id: 's1',
          deviceId: 'd1',
          kind: 'ONE_TIME',
          startAt,
          timeOfDay: null,
          daysOfWeek: [],
          durationSeconds: 30,
          label: 'Wake up',
          isActive: true,
          ringtoneId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      await expect(service.listForDevice('d1')).resolves.toEqual([
        {
          id: 's1',
          kind: 'ONE_TIME',
          startAt: '2030-01-01T07:00:00.000Z',
          timeOfDay: null,
          daysOfWeek: [],
          durationSeconds: 30,
          label: 'Wake up',
          ringtoneId: null,
        },
      ]);
    });
  });
});
