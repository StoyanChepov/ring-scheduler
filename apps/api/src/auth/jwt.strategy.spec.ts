import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  const findUnique = jest.fn();
  const prisma = { user: { findUnique } } as unknown as PrismaService;
  const config = {
    getOrThrow: () => 'a-test-secret-that-is-long-enough-123',
  } as unknown as ConfigService;

  let strategy: JwtStrategy;

  beforeEach(() => {
    findUnique.mockReset();
    strategy = new JwtStrategy(config, prisma);
  });

  it('returns the user when the account still exists', async () => {
    findUnique.mockResolvedValue({ id: 'u1', email: 'a@b.com' });

    await expect(
      strategy.validate({ sub: 'u1', email: 'a@b.com' }),
    ).resolves.toEqual({ id: 'u1', email: 'a@b.com' });
  });

  it('rejects a valid token for a deleted account', async () => {
    findUnique.mockResolvedValue(null);

    await expect(
      strategy.validate({ sub: 'gone', email: 'a@b.com' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
