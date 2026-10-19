import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  CreateScheduleDto,
  UpdateScheduleDto,
} from './dto/create-schedule.dto';
import { SchedulesService } from './schedules.service';

@UseGuards(JwtAuthGuard)
@Controller('devices/:deviceId/schedules')
export class SchedulesController {
  constructor(private readonly schedulesService: SchedulesService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Param('deviceId', ParseUUIDPipe) deviceId: string,
  ) {
    return this.schedulesService.list(user.id, deviceId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Param('deviceId', ParseUUIDPipe) deviceId: string,
    @Body() dto: CreateScheduleDto,
  ) {
    return this.schedulesService.create(user.id, deviceId, dto);
  }

  @Patch(':scheduleId')
  update(
    @CurrentUser() user: AuthUser,
    @Param('deviceId', ParseUUIDPipe) deviceId: string,
    @Param('scheduleId', ParseUUIDPipe) scheduleId: string,
    @Body() dto: UpdateScheduleDto,
  ) {
    return this.schedulesService.update(user.id, deviceId, scheduleId, dto);
  }

  @Delete(':scheduleId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: AuthUser,
    @Param('deviceId', ParseUUIDPipe) deviceId: string,
    @Param('scheduleId', ParseUUIDPipe) scheduleId: string,
  ) {
    return this.schedulesService.remove(user.id, deviceId, scheduleId);
  }
}
