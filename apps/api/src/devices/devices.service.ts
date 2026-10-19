import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDeviceDto } from './dto/create-device.dto';

@Injectable()
export class DevicesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(userId: string) {
    return this.prisma.device.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  create(userId: string, dto: CreateDeviceDto) {
    return this.prisma.device.create({
      data: {
        userId,
        name: dto.name,
        platform: dto.platform ?? 'MOCK',
        fcmToken: dto.fcmToken,
        lastSeenAt: new Date(),
      },
    });
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

    return this.prisma.device.findFirst({ where: { id: deviceId, userId } });
  }
}
