import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from './prisma.service';

// Runs without a database or .env (as in CI): the client is only built here,
// it connects in onModuleInit, which these tests never call.
describe('PrismaService', () => {
  const originalUrl = process.env.DATABASE_URL;

  afterEach(() => {
    if (originalUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalUrl;
  });

  it('builds a client from DATABASE_URL', async () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/test';

    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService],
    }).compile();

    expect(module.get<PrismaService>(PrismaService)).toBeDefined();
  });

  it('refuses to start without DATABASE_URL', () => {
    delete process.env.DATABASE_URL;

    expect(() => new PrismaService()).toThrow('DATABASE_URL is not defined');
  });
});
