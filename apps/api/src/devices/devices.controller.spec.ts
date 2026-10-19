import { Test, TestingModule } from '@nestjs/testing';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DevicesController } from './devices.controller';
import { DevicesService } from './devices.service';

describe('DevicesController', () => {
  let controller: DevicesController;

  const devicesService = {
    findAll: jest.fn(),
    create: jest.fn(),
    updateToken: jest.fn(),
  };
  const user = { id: 'user-1', email: 'a@b.com' };

  beforeEach(async () => {
    jest.resetAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DevicesController],
      providers: [{ provide: DevicesService, useValue: devicesService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(DevicesController);
  });

  it('lists devices for the authenticated user', async () => {
    devicesService.findAll.mockResolvedValue([{ id: 'd1' }]);

    await expect(controller.findAll(user)).resolves.toEqual([{ id: 'd1' }]);
    expect(devicesService.findAll).toHaveBeenCalledWith('user-1');
  });

  it('updates a device token for the authenticated user', async () => {
    devicesService.updateToken.mockResolvedValue({ id: 'd1' });

    await controller.updateToken(user, 'd1', { fcmToken: 'new-token' });

    expect(devicesService.updateToken).toHaveBeenCalledWith(
      'user-1',
      'd1',
      'new-token',
    );
  });

  it('creates a device for the authenticated user', async () => {
    const dto = { name: 'Pixel' };
    devicesService.create.mockResolvedValue({ id: 'd1' });

    await controller.create(user, dto);

    expect(devicesService.create).toHaveBeenCalledWith('user-1', dto);
  });
});
