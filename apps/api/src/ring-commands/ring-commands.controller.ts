import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RingDeviceDto } from './dto/ring-device.dto';
import { RingCommandsService } from './ring-commands.service';

@UseGuards(JwtAuthGuard)
@Controller('devices/:deviceId')
export class RingCommandsController {
  constructor(private readonly ringCommandsService: RingCommandsService) {}

  @Post('ring')
  ringDevice(
    @CurrentUser() user: AuthUser,
    @Param('deviceId', ParseUUIDPipe) deviceId: string,
    @Body() dto: RingDeviceDto,
  ) {
    return this.ringCommandsService.ringDevice(user.id, deviceId, dto);
  }

  @Post('stop')
  stopDevice(
    @CurrentUser() user: AuthUser,
    @Param('deviceId', ParseUUIDPipe) deviceId: string,
  ) {
    return this.ringCommandsService.stopDevice(user.id, deviceId);
  }
}
