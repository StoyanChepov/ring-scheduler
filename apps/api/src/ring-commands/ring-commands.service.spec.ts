import { Test, TestingModule } from '@nestjs/testing';
import { RingCommandsService } from './ring-commands.service';

describe('RingCommandsService', () => {
  let service: RingCommandsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RingCommandsService],
    }).compile();

    service = module.get<RingCommandsService>(RingCommandsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
