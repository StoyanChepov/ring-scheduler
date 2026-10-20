import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import { PrismaService } from '../prisma/prisma.service';
import { detectAudioType } from './audio-type';

export const MAX_RINGTONE_BYTES = 1024 * 1024;
const MAX_RINGTONES_PER_USER = 10;

/** The fields used from multer's uploaded file. */
export interface UploadedAudio {
  buffer: Buffer;
  originalname: string;
  size: number;
}

// Everything except the audio itself, which can be up to 1 MB per row.
const WITHOUT_DATA = { data: true } as const;

@Injectable()
export class RingtonesService {
  private readonly logger = new Logger(RingtonesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly firebase: FirebaseService,
  ) {}

  list(userId: string) {
    return this.prisma.ringtone.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      omit: WITHOUT_DATA,
    });
  }

  async upload(userId: string, file: UploadedAudio | undefined, name?: string) {
    if (!file || file.size === 0) {
      throw new BadRequestException('Choose an audio file to upload');
    }

    if (file.size > MAX_RINGTONE_BYTES) {
      throw new BadRequestException('A ringtone can be at most 1 MB');
    }

    const mimeType = detectAudioType(file.buffer);

    if (!mimeType) {
      throw new BadRequestException(
        'That is not an MP3, OGG, WAV or M4A audio file',
      );
    }

    const existing = await this.prisma.ringtone.count({ where: { userId } });

    if (existing >= MAX_RINGTONES_PER_USER) {
      throw new BadRequestException(
        `You can have at most ${MAX_RINGTONES_PER_USER} ringtones`,
      );
    }

    // Default name: the file name without its extension.
    const fallbackName = file.originalname.replace(/\.[^.]+$/, '');
    const finalName = (name?.trim() || fallbackName || 'Ringtone').slice(0, 80);

    return this.prisma.ringtone.create({
      data: {
        userId,
        name: finalName,
        mimeType,
        sizeBytes: file.size,
        data: new Uint8Array(file.buffer),
      },
      omit: WITHOUT_DATA,
    });
  }

  /** The audio for the owner (dashboard preview) or one of their phones. */
  async file(userId: string, ringtoneId: string) {
    const ringtone = await this.prisma.ringtone.findFirst({
      where: { id: ringtoneId, userId },
      select: { mimeType: true, data: true },
    });

    if (!ringtone) {
      throw new NotFoundException('Ringtone not found');
    }

    return ringtone;
  }

  /**
   * Deletes a ringtone. Its alarms fall back to the default sound (the
   * foreign key sets them to null), and the phones that had them are told to
   * re-sync so they stop using their cached copy.
   */
  async remove(userId: string, ringtoneId: string) {
    const affectedDevices = await this.prisma.device.findMany({
      where: {
        userId,
        platform: 'ANDROID',
        schedules: { some: { ringtoneId } },
      },
      select: { id: true, fcmToken: true },
    });

    const { count } = await this.prisma.ringtone.deleteMany({
      where: { id: ringtoneId, userId },
    });

    if (count === 0) {
      throw new NotFoundException('Ringtone not found');
    }

    if (!this.firebase.isEnabled) return;

    for (const device of affectedDevices) {
      if (!device.fcmToken) continue;

      const outcome = await this.firebase.sendSchedulesChanged(device.fcmToken);

      if (outcome.status === 'failed') {
        this.logger.warn(
          `Could not tell device ${device.id} a ringtone was removed: ${outcome.reason}`,
        );
      }
    }
  }

  /** Throws unless the ringtone exists and belongs to the user. */
  async assertOwned(userId: string, ringtoneId: string) {
    const ringtone = await this.prisma.ringtone.findFirst({
      where: { id: ringtoneId, userId },
      select: { id: true },
    });

    if (!ringtone) {
      throw new BadRequestException('Unknown ringtone');
    }
  }
}
