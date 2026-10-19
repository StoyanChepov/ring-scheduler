import { Module } from '@nestjs/common';
import { DeviceAuthGuard } from '../device-auth/device-auth.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { DeviceApiController } from './device-api.controller';
import { DevicesController } from './devices.controller';
import { DevicesService } from './devices.service';

@Module({
  imports: [PrismaModule],
  controllers: [DevicesController, DeviceApiController],
  providers: [DevicesService, DeviceAuthGuard],
})
export class DevicesModule {}
