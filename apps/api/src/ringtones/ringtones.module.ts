import { Module } from '@nestjs/common';
import { DeviceAuthGuard } from '../device-auth/device-auth.guard';
import { FirebaseModule } from '../firebase/firebase.module';
import { PrismaModule } from '../prisma/prisma.module';
import {
  DeviceRingtonesController,
  RingtonesController,
} from './ringtones.controller';
import { RingtonesService } from './ringtones.service';

@Module({
  imports: [PrismaModule, FirebaseModule],
  controllers: [RingtonesController, DeviceRingtonesController],
  providers: [RingtonesService, DeviceAuthGuard],
  exports: [RingtonesService],
})
export class RingtonesModule {}
