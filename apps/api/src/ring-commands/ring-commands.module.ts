import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RingCommandsController } from './ring-commands.controller';
import { RingCommandsService } from './ring-commands.service';

@Module({
  imports: [PrismaModule],
  controllers: [RingCommandsController],
  providers: [RingCommandsService],
})
export class RingCommandsModule {}