import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AuthResponse, JwtPayload } from './auth.types';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

const BCRYPT_ROUNDS = 12;
const PRISMA_UNIQUE_VIOLATION = 'P2002';

@Injectable()
export class AuthService {
  // Compared against when the email is unknown, so a login attempt takes
  // about the same time whether or not the account exists.
  private dummyHash?: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

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

  private async getDummyHash(): Promise<string> {
    this.dummyHash ??= await bcrypt.hash('not-a-real-password', BCRYPT_ROUNDS);
    return this.dummyHash;
  }
}
