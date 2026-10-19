import { Injectable, NotFoundException } from '@nestjs/common';
import { generateDeviceKey, hashDeviceKey } from '../device-auth/device-key';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDeviceDto } from './dto/create-device.dto';

// The key hash is a credential; it never goes out in a response.
const HIDE_KEY = { keyHash: true } as const;

@Injectable()
export class DevicesService {
  constructor(private readonly prisma: PrismaService) {}

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
