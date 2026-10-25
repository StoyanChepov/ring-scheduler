import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { FirebaseService } from '../firebase/firebase.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthResponse, JwtPayload } from './auth.types';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

const BCRYPT_ROUNDS = 12;
const PRISMA_UNIQUE_VIOLATION = 'P2002';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  // Compared against when the email is unknown, so a login attempt takes
  // about the same time whether or not the account exists.
  private dummyHash?: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly firebase: FirebaseService,
  ) {}

  /**
   * Other sessions keep working until their token expires (an hour by
   * default); phones are unaffected, they sign in with their device key.
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    await this.verifyPassword(userId, currentPassword);

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await bcrypt.hash(newPassword, BCRYPT_ROUNDS) },
    });
  }

  /**
   * Deletes the account with everything in it: devices (with their alarms,
   * commands and history) and ringtones. Phones are then nudged to sync, which
   * is refused, so they sign out and cancel their alarms, as when a single
   * device is removed.
   */
  async deleteAccount(userId: string, password: string): Promise<void> {
    await this.verifyPassword(userId, password);

    const phones = await this.prisma.device.findMany({
      where: { userId, platform: 'ANDROID' },
      select: { id: true, fcmToken: true },
    });

    // Children before parents: only AlarmEvent cascades on its own. All or
    // nothing.
    await this.prisma.$transaction([
      this.prisma.ringSchedule.deleteMany({ where: { device: { userId } } }),
      this.prisma.ringCommand.deleteMany({ where: { device: { userId } } }),
      this.prisma.device.deleteMany({ where: { userId } }),
      this.prisma.ringtone.deleteMany({ where: { userId } }),
      this.prisma.user.delete({ where: { id: userId } }),
    ]);

    if (!this.firebase.isEnabled) return;

    // Best effort: a phone that misses it finds out the next time it syncs.
    await Promise.all(
      phones.map(async ({ id, fcmToken }) => {
        if (!fcmToken) return;
        const outcome = await this.firebase.sendSchedulesChanged(fcmToken);
        if (outcome.status === 'failed') {
          this.logger.warn(
            `Could not tell device ${id} of a deleted account to sign out: ${outcome.reason}`,
          );
        }
      }),
    );
  }

  async register(dto: RegisterDto): Promise<AuthResponse> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException('Email is already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    try {
      const user = await this.prisma.user.create({
        data: { email: dto.email, passwordHash },
        select: { id: true, email: true },
      });

      return this.buildResponse(user);
    } catch (error) {
      // Two registrations for the same email can race past the check above.
      if (
        typeof error === 'object' &&
        error !== null &&
        (error as { code?: string }).code === PRISMA_UNIQUE_VIOLATION
      ) {
        throw new ConflictException('Email is already registered');
      }
      throw error;
    }
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    const hash = user?.passwordHash ?? (await this.getDummyHash());
    const passwordMatches = await bcrypt.compare(dto.password, hash);

    if (!user || !passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return this.buildResponse({ id: user.id, email: user.email });
  }

  private async buildResponse(user: {
    id: string;
    email: string;
  }): Promise<AuthResponse> {
    const payload: JwtPayload = { sub: user.id, email: user.email };

    return {
      accessToken: await this.jwtService.signAsync(payload),
      user: { id: user.id, email: user.email },
    };
  }

  // 403 rather than 401: the session is fine, only this password is wrong,
  // and a 401 would log the dashboard out.
  private async verifyPassword(userId: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });

    if (!user) {
      throw new UnauthorizedException();
    }

    if (!(await bcrypt.compare(password, user.passwordHash))) {
      throw new ForbiddenException('Password is incorrect');
    }
  }

  private async getDummyHash(): Promise<string> {
    this.dummyHash ??= await bcrypt.hash('not-a-real-password', BCRYPT_ROUNDS);
    return this.dummyHash;
  }
}
