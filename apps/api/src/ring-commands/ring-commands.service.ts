import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RingDeviceDto } from './dto/ring-device.dto';

const DEV_USER_ID = '00000000-0000-0000-0000-000000000001';

@Injectable()
export class RingCommandsService {
  constructor(private readonly prisma: PrismaService) {}

  async ringDevice(deviceId: string, dto: RingDeviceDto) {
    const device = await this.prisma.device.findFirst({
      where: {
        id: deviceId,
        userId: DEV_USER_ID,
      },
    });

    if (!device) {
      throw new NotFoundException('Device not found');
    }

    const command = await this.prisma.ringCommand.create({
      data: {
        userId: DEV_USER_ID,
        deviceId,
        type: 'RING_START',
        status: 'CREATED',
        durationSeconds: dto.durationSeconds,
      },
    });

    console.log(
      `[MOCK_DEVICE] Ring ${device.name} for ${dto.durationSeconds} seconds`,
    );

    return {
      ...command,
      mockDelivery: {
        delivered: true,
        message: `Mock ring command sent to ${device.name}`,
      },
    };
  }

  async stopDevice(deviceId: string) {
    const device = await this.prisma.device.findFirst({
      where: {
        id: deviceId,
        userId: DEV_USER_ID,
      },
    });

    if (!device) {
      throw new NotFoundException('Device not found');
    }

    const command = await this.prisma.ringCommand.create({
      data: {
        userId: DEV_USER_ID,
        deviceId,
        type: 'RING_STOP',
        status: 'CREATED',
      },
    });

    console.log(`[MOCK_DEVICE] Stop ringing ${device.name}`);

    return {
      ...command,
      mockDelivery: {
        delivered: true,
        message: `Mock stop command sent to ${device.name}`,
      },
    };
  }
}