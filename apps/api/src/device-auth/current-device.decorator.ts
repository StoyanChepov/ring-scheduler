import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthDevice } from './device-auth.types';

/** Injects the authenticated device. Only use on routes behind DeviceAuthGuard. */
export const CurrentDevice = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthDevice =>
    ctx.switchToHttp().getRequest<{ device: AuthDevice }>().device,
);
