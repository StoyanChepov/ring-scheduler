import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { generateDeviceKey, hashDeviceKey } from '../device-auth/device-key';
import { FirebaseService } from '../firebase/firebase.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDeviceDto } from './dto/create-device.dto';

// The key hash is a credential; it never goes out in a response.
const HIDE_KEY = { keyHash: true } as const;

@Injectable()
export class DevicesService {
  private readonly logger = new Logger(DevicesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly firebase: FirebaseService,
  ) {}

  /**
   * Removes a device with its alarms, commands and history. Its key stops
   * working at once. The phone is then nudged to sync: the sync is refused,
   * and the app logs out and cancels the alarms it had cached.
   */
  async remove(userId: string, deviceId: string) {
    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, userId },
      select: { id: true, platform: true, fcmToken: true },
    });

    if (!device) {
      throw new NotFoundException('Device not found');
    }

    // Schedules and commands have no cascade, so they go first; history
    // (AlarmEvent) cascades with the device. All or nothing.
    await this.prisma.$transaction([
      this.prisma.ringSchedule.deleteMany({ where: { deviceId } }),
      this.prisma.ringCommand.deleteMany({ where: { deviceId } }),
      this.prisma.device.delete({ where: { id: deviceId } }),
    ]);

    if (device.platform !== 'ANDROID' || !device.fcmToken) return;
    if (!this.firebase.isEnabled) return;

    // Best effort: if it fails, the phone finds out the next time it opens.
    const outcome = await this.firebase.sendSchedulesChanged(device.fcmToken);

    if (outcome.status === 'failed') {
      this.logger.warn(
        `Could not tell removed device ${deviceId} to sign out: ${outcome.reason}`,
      );
    }
  }

  findAll(userId: string) {
    return this.prisma.device.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      omit: HIDE_KEY,
    });
  }

  /**
   * Real phones get a device key so they can authenticate on their own later.
   * It is returned here once and cannot be read back.
   */
  async create(userId: string, dto: CreateDeviceDto) {
    const platform = dto.platform ?? 'MOCK';
    const deviceKey = platform === 'ANDROID' ? generateDeviceKey() : undefined;

    const device = await this.prisma.device.create({
      data: {
        userId,
        name: dto.name,
        platform,
        fcmToken: dto.fcmToken,
        lastSeenAt: new Date(),
        ...(deviceKey && { keyHash: hashDeviceKey(deviceKey) }),
      },
      omit: HIDE_KEY,
    });

    return deviceKey ? { ...device, deviceKey } : device;
  }

  // Only the dashboard shows the name; the phone sends it once, when it is
  // added, and never reads it back.
  async rename(userId: string, deviceId: string, name: string) {
    const { count } = await this.prisma.device.updateMany({
      where: { id: deviceId, userId },
      data: { name },
    });

    if (count === 0) {
      throw new NotFoundException('Device not found');
    }

    return this.prisma.device.findFirst({
      where: { id: deviceId, userId },
      omit: HIDE_KEY,
    });
  }

  /**
   * Replaces the device's key, e.g. when the owner logs in again on the phone.
   * The old key stops working immediately.
   */
  async issueKey(userId: string, deviceId: string) {
    const deviceKey = generateDeviceKey();

    const { count } = await this.prisma.device.updateMany({
      where: { id: deviceId, userId },
      data: { keyHash: hashDeviceKey(deviceKey) },
    });

    if (count === 0) {
      throw new NotFoundException('Device not found');
    }

    return { deviceKey };
  }

  // FCM rotates tokens, so devices need a way to report the new one.
  async updateToken(userId: string, deviceId: string, fcmToken: string) {
    // Ownership is part of the update itself, so there is no gap between
    // checking and writing.
    const { count } = await this.prisma.device.updateMany({
      where: { id: deviceId, userId },
      data: { fcmToken, lastSeenAt: new Date() },
    });

    if (count === 0) {
      throw new NotFoundException('Device not found');
    }

    return this.prisma.device.findFirst({
      where: { id: deviceId, userId },
      omit: HIDE_KEY,
    });
  }

  /** Called by the phone itself, already authenticated by its device key. */
  async updateOwnToken(deviceId: string, fcmToken: string) {
    await this.prisma.device.update({
      where: { id: deviceId },
      data: { fcmToken, lastSeenAt: new Date() },
    });
  }
}
