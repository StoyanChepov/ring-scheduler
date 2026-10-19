import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

// Comma-separated list of web origins allowed to call the API, e.g.
// "https://ring-scheduler-web.vercel.app". Defaults to the local Vite server.
function allowedOrigins(): string[] {
  const configured = process.env.WEB_ORIGINS?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return configured?.length ? configured : ['http://localhost:5173'];
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // On Vercel every request arrives through its proxy. Trusting it makes
  // req.ip the caller's address, so rate limits apply per user instead of
  // one shared limit for everyone.
  if (process.env.VERCEL) {
    app.set('trust proxy', true);
  }

  app.enableCors({
    origin: allowedOrigins(),
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
