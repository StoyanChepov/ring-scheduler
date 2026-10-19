import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { CurrentDevice } from '../device-auth/current-device.decorator';
import { DeviceAuthGuard } from '../device-auth/device-auth.guard';
import type { AuthDevice } from '../device-auth/device-auth.types';
import { DevicesService } from './devices.service';
import { UpdateDeviceTokenDto } from './dto/update-device-token.dto';

/**
 * Routes the phone calls as itself, with its device key. The web dashboard
 * uses DevicesController (user login) instead.
 */
@UseGuards(DeviceAuthGuard)
@Controller('device')
export class DeviceApiController {
  constructor(private readonly devicesService: DevicesService) {}

  @Patch('token')
  @HttpCode(HttpStatus.NO_CONTENT)
  updateToken(
    @CurrentDevice() device: AuthDevice,
    @Body() dto: UpdateDeviceTokenDto,
  ) {
    return this.devicesService.updateOwnToken(device.id, dto.fcmToken);
  }
}
