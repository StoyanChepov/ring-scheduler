/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument --
   jest.fn() mock calls are untyped by nature. */
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;

  const prisma = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  };
  const jwtService = { signAsync: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    jwtService.signAsync.mockResolvedValue('signed-token');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  describe('register', () => {
    it('stores a bcrypt hash, never the plain password, and returns a token', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({ id: 'u1', email: 'a@b.com' });

      const result = await service.register({
        email: 'a@b.com',
        password: 'correct horse',
      });

      const stored = prisma.user.create.mock.calls[0][0].data;
      expect(stored.email).toBe('a@b.com');
      expect(stored.passwordHash).not.toBe('correct horse');
      expect(await bcrypt.compare('correct horse', stored.passwordHash)).toBe(
        true,
      );
      expect(jwtService.signAsync).toHaveBeenCalledWith({
        sub: 'u1',
        email: 'a@b.com',
      });
      expect(result).toEqual({
        accessToken: 'signed-token',
        user: { id: 'u1', email: 'a@b.com' },
      });
    });

    it('rejects an email that is already registered', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1' });

      await expect(
        service.register({ email: 'a@b.com', password: 'correct horse' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('maps a unique-constraint race to a conflict', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockRejectedValue({ code: 'P2002' });

      await expect(
        service.register({ email: 'a@b.com', password: 'correct horse' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('login', () => {
    it('returns a token for the right password', async () => {
      const passwordHash = await bcrypt.hash('correct horse', 4);
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'a@b.com',
        passwordHash,
      });

      const result = await service.login({
        email: 'a@b.com',
        password: 'correct horse',
      });

      expect(result.accessToken).toBe('signed-token');
      expect(result.user).toEqual({ id: 'u1', email: 'a@b.com' });
    });

    it('rejects a wrong password', async () => {
      const passwordHash = await bcrypt.hash('correct horse', 4);
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'a@b.com',
        passwordHash,
      });

      await expect(
        service.login({ email: 'a@b.com', password: 'wrong' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(jwtService.signAsync).not.toHaveBeenCalled();
    });

    it('rejects an unknown email with the same error as a wrong password', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ email: 'nobody@b.com', password: 'whatever1' }),
      ).rejects.toThrow('Invalid email or password');
    });

    it('rejects accounts whose stored hash is not a bcrypt hash', async () => {
      // The old dev user was created with a placeholder instead of a hash.
      prisma.user.findUnique.mockResolvedValue({
        id: 'dev',
        email: 'dev@ringscheduler.local',
        passwordHash: 'dev-only-password-hash',
      });

      await expect(
        service.login({
          email: 'dev@ringscheduler.local',
          password: 'dev-only-password-hash',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });
});
