import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AlarmEventDto } from './dto/report-events.dto';

// History is for "did it ring?", not an audit log; old events are dropped.
const KEEP_FOR_MS = 30 * 24 * 60 * 60 * 1000;

const MAX_LIST = 100;

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Stores what the phone reports. Events it already sent are skipped. */
  async report(deviceId: string, events: AlarmEventDto[]) {
    const { count } = await this.prisma.alarmEvent.createMany({
      data: events.map((event) => ({
        id: event.id,
        deviceId,
        type: event.type,
        source: event.source,
        scheduleId: event.scheduleId,
        commandId: event.commandId,
        detail: event.detail,
        occurredAt: new Date(event.occurredAt),
      })),
      skipDuplicates: true,
    });

    await this.prisma.alarmEvent.deleteMany({
      where: {
        deviceId,
        occurredAt: { lt: new Date(Date.now() - KEEP_FOR_MS) },
      },
    });

    return { received: events.length, stored: count };
  }

  /** The newest events first, for the dashboard. */
  async list(userId: string, deviceId: string, limit = 20) {
    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, userId },
      select: { id: true },
    });

    if (!device) {
      throw new NotFoundException('Device not found');
    }

    return this.prisma.alarmEvent.findMany({
      where: { deviceId },
      orderBy: { occurredAt: 'desc' },
      take: Math.min(Math.max(limit, 1), MAX_LIST),
    });
  }
}
