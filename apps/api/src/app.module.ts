import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DevicesModule } from './devices/devices.module';
import { PrismaModule } from './prisma/prisma.module';
import { RingCommandsModule } from './ring-commands/ring-commands.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    DevicesModule,
    RingCommandsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}