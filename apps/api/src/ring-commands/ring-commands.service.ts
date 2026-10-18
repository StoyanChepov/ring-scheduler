import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RingDeviceDto } from './dto/ring-device.dto';

@Injectable()
export class RingCommandsService {
  constructor(private readonly prisma: PrismaService) {}

  async ringDevice(userId: string, deviceId: string, dto: RingDeviceDto) {
    const device = await this.findOwnedDevice(userId, deviceId);

    const command = await this.prisma.ringCommand.create({
      data: {
        userId,
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

  async stopDevice(userId: string, deviceId: string) {
    const device = await this.findOwnedDevice(userId, deviceId);

    const command = await this.prisma.ringCommand.create({
      data: {
        userId,
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

  // Someone else's device and a missing device both give 404, so device IDs
  // can't be probed.
  private async findOwnedDevice(userId: string, deviceId: string) {
    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, userId },
    });

    if (!device) {
      throw new NotFoundException('Device not found');
    }

    return device;
  }
}
