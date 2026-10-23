import { Module } from '@nestjs/common';
import { DeviceAuthGuard } from '../device-auth/device-auth.guard';
import { FirebaseModule } from '../firebase/firebase.module';
import { PrismaModule } from '../prisma/prisma.module';
import { DeviceApiController } from './device-api.controller';
import { DevicesController } from './devices.controller';
import { DevicesService } from './devices.service';

@Module({
  imports: [PrismaModule, FirebaseModule],
  controllers: [DevicesController, DeviceApiController],
  providers: [DevicesService, DeviceAuthGuard],
})
export class DevicesModule {}
