import { Module } from '@nestjs/common';
import { DeviceAuthGuard } from '../device-auth/device-auth.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { DeviceEventsController, EventsController } from './events.controller';
import { EventsService } from './events.service';

@Module({
  imports: [PrismaModule],
  controllers: [EventsController, DeviceEventsController],
  providers: [EventsService, DeviceAuthGuard],
})
export class EventsModule {}
