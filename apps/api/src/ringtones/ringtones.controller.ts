import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentDevice } from '../device-auth/current-device.decorator';
import { DeviceAuthGuard } from '../device-auth/device-auth.guard';
import type { AuthDevice } from '../device-auth/device-auth.types';
import {
  MAX_RINGTONE_BYTES,
  RingtonesService,
  type UploadedAudio,
} from './ringtones.service';

class UploadRingtoneDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;
}

function audioResponse(ringtone: { mimeType: string; data: Uint8Array }) {
  return new StreamableFile(Buffer.from(ringtone.data), {
    type: ringtone.mimeType,
    length: ringtone.data.length,
  });
}

@UseGuards(JwtAuthGuard)
@Controller('ringtones')
export class RingtonesController {
  constructor(private readonly ringtonesService: RingtonesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.ringtonesService.list(user.id);
  }

  // Multer stops reading just past the limit, so an oversized upload is
  // refused without buffering all of it.
  @Post()
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_RINGTONE_BYTES + 1 } }),
  )
  upload(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: UploadedAudio | undefined,
    @Body() dto: UploadRingtoneDto,
  ) {
    return this.ringtonesService.upload(user.id, file, dto.name);
  }

  /** For previewing in the dashboard. */
  @Get(':ringtoneId/file')
  async file(
    @CurrentUser() user: AuthUser,
    @Param('ringtoneId', ParseUUIDPipe) ringtoneId: string,
  ) {
    return audioResponse(await this.ringtonesService.file(user.id, ringtoneId));
  }

  @Delete(':ringtoneId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: AuthUser,
    @Param('ringtoneId', ParseUUIDPipe) ringtoneId: string,
  ) {
    return this.ringtonesService.remove(user.id, ringtoneId);
  }
}

/** The phone downloads its owner's ringtones to play them offline. */
@UseGuards(DeviceAuthGuard)
@Controller('device/ringtones')
export class DeviceRingtonesController {
  constructor(private readonly ringtonesService: RingtonesService) {}

  @Get(':ringtoneId')
  async file(
    @CurrentDevice() device: AuthDevice,
    @Param('ringtoneId', ParseUUIDPipe) ringtoneId: string,
  ) {
    return audioResponse(
      await this.ringtonesService.file(device.userId, ringtoneId),
    );
  }
}
