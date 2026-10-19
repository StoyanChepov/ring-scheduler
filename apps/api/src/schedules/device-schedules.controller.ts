import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentDevice } from '../device-auth/current-device.decorator';
import { DeviceAuthGuard } from '../device-auth/device-auth.guard';
import type { AuthDevice } from '../device-auth/device-auth.types';
import { SchedulesService } from './schedules.service';

/** The phone downloads its own schedules, authenticated by its device key. */
@UseGuards(DeviceAuthGuard)
@Controller('device/schedules')
export class DeviceSchedulesController {
  constructor(private readonly schedulesService: SchedulesService) {}

  @Get()
  list(@CurrentDevice() device: AuthDevice) {
    return this.schedulesService.listForDevice(device.id);
  }
}
