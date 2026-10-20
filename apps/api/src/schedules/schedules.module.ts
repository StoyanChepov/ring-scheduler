import { Module } from '@nestjs/common';
import { DeviceAuthGuard } from '../device-auth/device-auth.guard';
import { FirebaseModule } from '../firebase/firebase.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RingtonesModule } from '../ringtones/ringtones.module';
import { DeviceSchedulesController } from './device-schedules.controller';
import { SchedulesController } from './schedules.controller';
import { SchedulesService } from './schedules.service';

@Module({
  imports: [PrismaModule, FirebaseModule, RingtonesModule],
  controllers: [SchedulesController, DeviceSchedulesController],
  providers: [SchedulesService, DeviceAuthGuard],
})
export class SchedulesModule {}
