import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDeviceDto } from './dto/create-device.dto';

const DEV_USER_ID = '00000000-0000-0000-0000-000000000001';

@Injectable()
export class DevicesService {
  constructor(private readonly prisma: PrismaService) {}

  private async ensureDevUser() {
    return this.prisma.user.upsert({
      where: {
        id: DEV_USER_ID,
      },
      update: {},
      create: {
        id: DEV_USER_ID,
        email: 'dev@ringscheduler.local',
        passwordHash: 'dev-only-password-hash',
      },
    });
  }

  async findAll() {
    await this.ensureDevUser();

    return this.prisma.device.findMany({
      where: {
        userId: DEV_USER_ID,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async create(dto: CreateDeviceDto) {
    await this.ensureDevUser();

    return this.prisma.device.create({
      data: {
        userId: DEV_USER_ID,
        name: dto.name,
        platform: dto.platform ?? 'MOCK',
        fcmToken: dto.fcmToken,
        lastSeenAt: new Date(),
      },
    });
  }
}