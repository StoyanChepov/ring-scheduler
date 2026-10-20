import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import { PrismaService } from '../prisma/prisma.service';
import { RingtonesService } from '../ringtones/ringtones.service';
import { RingDeviceDto } from './dto/ring-device.dto';

type CommandType = 'RING_START' | 'RING_STOP';

export interface DeliveryResult {
  /** "mock" for MOCK devices, "fcm" when a real push was (or should have been) sent. */
  mode: 'mock' | 'fcm';
  delivered: boolean;
  message: string;
}

interface DeviceRow {
  id: string;
  name: string;
  platform: string;
  fcmToken: string | null;
}

@Injectable()
export class RingCommandsService {
  private readonly logger = new Logger(RingCommandsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly firebase: FirebaseService,
    private readonly ringtones: RingtonesService,
  ) {}

  async ringDevice(userId: string, deviceId: string, dto: RingDeviceDto) {
    if (dto.ringtoneId) {
      await this.ringtones.assertOwned(userId, dto.ringtoneId);
    }

    return this.dispatch(
      userId,
      deviceId,
      'RING_START',
      dto.durationSeconds,
      dto.ringtoneId,
    );
  }

  stopDevice(userId: string, deviceId: string) {
    return this.dispatch(userId, deviceId, 'RING_STOP');
  }

  private async dispatch(
    userId: string,
    deviceId: string,
    type: CommandType,
    durationSeconds?: number,
    ringtoneId?: string,
  ) {
    const device = await this.findOwnedDevice(userId, deviceId);

    // The command is stored first so there is a record even if delivery fails.
    const command = await this.prisma.ringCommand.create({
      data: {
        userId,
        deviceId,
        type,
        status: 'CREATED',
        ...(durationSeconds !== undefined && { durationSeconds }),
        ...(ringtoneId && { ringtoneId }),
      },
    });

    const delivery = await this.deliver(
      device,
      command.id,
      type,
      durationSeconds,
      ringtoneId,
    );

    const updated = await this.prisma.ringCommand.update({
      where: { id: command.id },
      data: { status: delivery.delivered ? 'SENT' : 'FAILED' },
    });

    return { ...updated, delivery };
  }

  private async deliver(
    device: DeviceRow,
    commandId: string,
    type: CommandType,
    durationSeconds?: number,
    ringtoneId?: string,
  ): Promise<DeliveryResult> {
    const action = type === 'RING_START' ? 'Ring' : 'Stop';

    if (device.platform === 'MOCK') {
      this.logger.log(
        `[MOCK_DEVICE] ${action} ${device.name}` +
          (durationSeconds !== undefined
            ? ` for ${durationSeconds} seconds`
            : ''),
      );

      return {
        mode: 'mock',
        delivered: true,
        message: `Mock ${action.toLowerCase()} command sent to ${device.name}`,
      };
    }

    if (!device.fcmToken) {
      return {
        mode: 'fcm',
        delivered: false,
        message: `${device.name} has no push token yet. Open the app on the device so it can register.`,
      };
    }

    if (!this.firebase.isEnabled) {
      return {
        mode: 'fcm',
        delivered: false,
        message: 'Push delivery is not configured on the server.',
      };
    }

    const outcome = await this.firebase.sendRingCommand(device.fcmToken, {
      commandId,
      type,
      durationSeconds,
      ringtoneId,
    });

    if (outcome.status === 'sent') {
      return {
        mode: 'fcm',
        delivered: true,
        message: `${action} command sent to ${device.name}`,
      };
    }

    if (outcome.invalidToken) {
      // FCM will never accept this token again, so stop trying it.
      await this.prisma.device.update({
        where: { id: device.id },
        data: { fcmToken: null },
      });

      return {
        mode: 'fcm',
        delivered: false,
        message: `${device.name}'s push token is no longer valid. Open the app on the device to register again.`,
      };
    }

    return { mode: 'fcm', delivered: false, message: outcome.reason };
  }

  // Someone else's device and a missing device both give 404, so device IDs
  // can't be probed.
  private async findOwnedDevice(
    userId: string,
    deviceId: string,
  ): Promise<DeviceRow> {
    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, userId },
    });

    if (!device) {
      throw new NotFoundException('Device not found');
    }

    return device;
  }
}
