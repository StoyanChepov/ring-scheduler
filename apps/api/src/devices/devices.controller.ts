import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DevicesService } from './devices.service';
import { CreateDeviceDto } from './dto/create-device.dto';
import { UpdateDeviceTokenDto } from './dto/update-device-token.dto';

@UseGuards(JwtAuthGuard)
@Controller('devices')
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Get()
  findAll(@CurrentUser() user: AuthUser) {
    return this.devicesService.findAll(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateDeviceDto) {
    return this.devicesService.create(user.id, dto);
  }

  @Patch(':deviceId/token')
  updateToken(
    @CurrentUser() user: AuthUser,
    @Param('deviceId', ParseUUIDPipe) deviceId: string,
    @Body() dto: UpdateDeviceTokenDto,
  ) {
    return this.devicesService.updateToken(user.id, deviceId, dto.fcmToken);
  }
}
