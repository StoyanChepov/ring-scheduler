import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;

  const authService = {
    register: jest.fn(),
    login: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile();

    controller = module.get(AuthController);
  });

  it('delegates register to the service', async () => {
    const dto = { email: 'a@b.com', password: 'correct horse' };
    authService.register.mockResolvedValue({ accessToken: 't' });

    await expect(controller.register(dto)).resolves.toEqual({
      accessToken: 't',
    });
    expect(authService.register).toHaveBeenCalledWith(dto);
  });

  it('delegates login to the service', async () => {
    const dto = { email: 'a@b.com', password: 'correct horse' };
    authService.login.mockResolvedValue({ accessToken: 't' });

    await expect(controller.login(dto)).resolves.toEqual({ accessToken: 't' });
    expect(authService.login).toHaveBeenCalledWith(dto);
  });

  it('returns the authenticated user from /me', () => {
    const user = { id: 'u1', email: 'a@b.com' };

    expect(controller.me(user)).toBe(user);
  });
});
