import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { DevicesModule } from './devices/devices.module';
import { RingCommandsModule } from './ring-commands/ring-commands.module';
import { FirebaseModule } from './firebase/firebase.module';

@Module({
  imports: [PrismaModule, AuthModule, DevicesModule, RingCommandsModule, FirebaseModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
