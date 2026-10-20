import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentDevice } from '../device-auth/current-device.decorator';
import { DeviceAuthGuard } from '../device-auth/device-auth.guard';
import type { AuthDevice } from '../device-auth/device-auth.types';
import { ReportEventsDto } from './dto/report-events.dto';
import { EventsService } from './events.service';

/** The dashboard reads a device's history. */
@UseGuards(JwtAuthGuard)
@Controller('devices/:deviceId/events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Param('deviceId', ParseUUIDPipe) deviceId: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.eventsService.list(user.id, deviceId, limit);
  }
}

/** The phone reports what happened, authenticated by its device key. */
@UseGuards(DeviceAuthGuard)
@Controller('device/events')
export class DeviceEventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  report(@CurrentDevice() device: AuthDevice, @Body() dto: ReportEventsDto) {
    return this.eventsService.report(device.id, dto.events);
  }
}
