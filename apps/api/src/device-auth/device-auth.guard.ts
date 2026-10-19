import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthDevice } from './device-auth.types';
import { hashDeviceKey, looksLikeDeviceKey } from './device-key';

/**
 * Authenticates a phone by its device key (`Authorization: Bearer dk_...`).
 * Unlike a user login it does not expire, so the phone can fetch schedules
 * whenever a push tells it to, days after anyone last opened the app.
 */
@Injectable()
export class DeviceAuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      device?: AuthDevice;
    }>();

    const [scheme, key] = (request.headers.authorization ?? '').split(' ');

    if (scheme !== 'Bearer' || !key || !looksLikeDeviceKey(key)) {
      throw new UnauthorizedException();
    }

    const device = await this.prisma.device.findUnique({
      where: { keyHash: hashDeviceKey(key) },
      select: { id: true, userId: true },
    });

    if (!device) {
      throw new UnauthorizedException();
    }

    request.device = device;
    return true;
  }
}
