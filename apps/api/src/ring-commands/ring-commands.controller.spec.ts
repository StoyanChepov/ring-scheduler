import { Test, TestingModule } from '@nestjs/testing';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RingCommandsController } from './ring-commands.controller';
import { RingCommandsService } from './ring-commands.service';

describe('RingCommandsController', () => {
  let controller: RingCommandsController;

  const ringCommandsService = { ringDevice: jest.fn(), stopDevice: jest.fn() };
  const user = { id: 'user-1', email: 'a@b.com' };

  beforeEach(async () => {
    jest.resetAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RingCommandsController],
      providers: [
        { provide: RingCommandsService, useValue: ringCommandsService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(RingCommandsController);
  });

  it('passes the user and device to ringDevice', async () => {
    const dto = { durationSeconds: 20 };
    ringCommandsService.ringDevice.mockResolvedValue({ id: 'c1' });

    await controller.ringDevice(user, 'device-1', dto);

    expect(ringCommandsService.ringDevice).toHaveBeenCalledWith(
      'user-1',
      'device-1',
      dto,
    );
  });

  it('passes the user and device to stopDevice', async () => {
    ringCommandsService.stopDevice.mockResolvedValue({ id: 'c2' });

    await controller.stopDevice(user, 'device-1');

    expect(ringCommandsService.stopDevice).toHaveBeenCalledWith(
      'user-1',
      'device-1',
    );
  });
});
