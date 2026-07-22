import { Body, Controller, Param, Post } from '@nestjs/common';
import { RingDeviceDto } from './dto/ring-device.dto';
import { RingCommandsService } from './ring-commands.service';

@Controller('devices/:deviceId')
export class RingCommandsController {
  constructor(private readonly ringCommandsService: RingCommandsService) {}

  @Post('ring')
  ringDevice(@Param('deviceId') deviceId: string, @Body() dto: RingDeviceDto) {
    return this.ringCommandsService.ringDevice(deviceId, dto);
  }

  @Post('stop')
  stopDevice(@Param('deviceId') deviceId: string) {
    return this.ringCommandsService.stopDevice(deviceId);
  }
}