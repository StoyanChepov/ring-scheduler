import { Test, TestingModule } from '@nestjs/testing';
import { RingCommandsController } from './ring-commands.controller';

describe('RingCommandsController', () => {
  let controller: RingCommandsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RingCommandsController],
    }).compile();

    controller = module.get<RingCommandsController>(RingCommandsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
