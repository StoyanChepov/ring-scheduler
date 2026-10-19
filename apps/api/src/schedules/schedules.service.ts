import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateScheduleDto,
  UpdateScheduleDto,
} from './dto/create-schedule.dto';

// Keeps what the phone downloads and sets as alarms small.
const MAX_SCHEDULES_PER_DEVICE = 50;

// A one-time alarm this far in the past is over; the phone no longer needs it.
// The margin covers a phone whose clock runs slightly behind the server's.
const PAST_GRACE_MS = 60_000;

/** What the phone needs to set its alarms. */
export interface DeviceSchedule {
  id: string;
  kind: string;
  startAt: string | null;
  timeOfDay: string | null;
  daysOfWeek: number[];
  durationSeconds: number;
  label: string | null;
}

@Injectable()
export class SchedulesService {
  private readonly logger = new Logger(SchedulesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly firebase: FirebaseService,
  ) {}

  async list(userId: string, deviceId: string) {
    await this.findOwnedDevice(userId, deviceId);

    return this.prisma.ringSchedule.findMany({
      where: { deviceId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(userId: string, deviceId: string, dto: CreateScheduleDto) {
    const device = await this.findOwnedDevice(userId, deviceId);

    if (dto.kind === 'ONE_TIME' && new Date(dto.startAt!) <= new Date()) {
      throw new BadRequestException('startAt must be in the future');
    }

    const existing = await this.prisma.ringSchedule.count({
      where: { deviceId },
    });

    if (existing >= MAX_SCHEDULES_PER_DEVICE) {
      throw new BadRequestException(
        `A device can have at most ${MAX_SCHEDULES_PER_DEVICE} schedules`,
      );
    }

    // Only the fields for this kind are stored, so a row never carries a
    // stale time from the other kind.
    const schedule = await this.prisma.ringSchedule.create({
      data: {
        deviceId,
        kind: dto.kind,
        label: dto.label,
        durationSeconds: dto.durationSeconds,
        ...(dto.kind === 'ONE_TIME'
          ? { startAt: new Date(dto.startAt!), daysOfWeek: [] }
          : {
              timeOfDay: dto.timeOfDay,
              daysOfWeek: [...dto.daysOfWeek!].sort((a, b) => a - b),
            }),
      },
    });

    await this.notifyDevice(device);
    return schedule;
  }

  async update(
    userId: string,
    deviceId: string,
    scheduleId: string,
    dto: UpdateScheduleDto,
  ) {
    const device = await this.findOwnedDevice(userId, deviceId);

    // The device ID in the filter stops a schedule from another device (and
    // so possibly another user) being changed through this one's URL.
    const { count } = await this.prisma.ringSchedule.updateMany({
      where: { id: scheduleId, deviceId },
      data: dto,
    });

    if (count === 0) {
      throw new NotFoundException('Schedule not found');
    }

    await this.notifyDevice(device);
    return this.prisma.ringSchedule.findFirst({
      where: { id: scheduleId, deviceId },
    });
  }

  async remove(userId: string, deviceId: string, scheduleId: string) {
    const device = await this.findOwnedDevice(userId, deviceId);

    const { count } = await this.prisma.ringSchedule.deleteMany({
      where: { id: scheduleId, deviceId },
    });

    if (count === 0) {
      throw new NotFoundException('Schedule not found');
    }

    await this.notifyDevice(device);
  }

  /** The schedules the phone should set alarms for right now. */
  async listForDevice(deviceId: string): Promise<DeviceSchedule[]> {
    const schedules = await this.prisma.ringSchedule.findMany({
      where: {
        deviceId,
        isActive: true,
        OR: [
          { kind: 'WEEKLY' },
          { startAt: { gt: new Date(Date.now() - PAST_GRACE_MS) } },
        ],
      },
      orderBy: { createdAt: 'asc' },
    });

    return schedules.map((s) => ({
      id: s.id,
      kind: s.kind,
      startAt: s.startAt?.toISOString() ?? null,
      timeOfDay: s.timeOfDay,
      daysOfWeek: s.daysOfWeek,
      durationSeconds: s.durationSeconds,
      label: s.label,
    }));
  }

  /**
   * Best effort: if the push fails, the change is still saved and the phone
   * picks it up the next time the app opens and syncs.
   */
  private async notifyDevice(device: {
    id: string;
    platform: string;
    fcmToken: string | null;
  }) {
    if (device.platform !== 'ANDROID' || !device.fcmToken) {
      return;
    }

    if (!this.firebase.isEnabled) {
      this.logger.warn(
        `Schedules for device ${device.id} changed, but push is not configured`,
      );
      return;
    }

    const outcome = await this.firebase.sendSchedulesChanged(device.fcmToken);

    if (outcome.status === 'failed') {
      this.logger.warn(
        `Could not tell device ${device.id} its schedules changed: ${outcome.reason}`,
      );
    }
  }

  // Someone else's device and a missing device both give 404, so device IDs
  // can't be probed.
  private async findOwnedDevice(userId: string, deviceId: string) {
    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, userId },
      select: { id: true, platform: true, fcmToken: true },
    });

    if (!device) {
      throw new NotFoundException('Device not found');
    }

    return device;
  }
}
