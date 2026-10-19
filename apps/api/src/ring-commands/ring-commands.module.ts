import { Module } from '@nestjs/common';
import { FirebaseModule } from '../firebase/firebase.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RingCommandsController } from './ring-commands.controller';
import { RingCommandsService } from './ring-commands.service';

@Module({
  imports: [PrismaModule, FirebaseModule],
  controllers: [RingCommandsController],
  providers: [RingCommandsService],
})
export class RingCommandsModule {}
