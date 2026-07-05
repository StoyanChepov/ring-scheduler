import { Module } from '@nestjs/common';
import { RingCommandsController } from './ring-commands.controller';
import { RingCommandsService } from './ring-commands.service';

@Module({
  controllers: [RingCommandsController],
  providers: [RingCommandsService]
})
export class RingCommandsModule {}
