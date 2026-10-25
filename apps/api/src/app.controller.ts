import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  // For uptime monitors: the API is up and answering. No database call.
  @SkipThrottle()
  @Get('health')
  health() {
    return { status: 'ok' };
  }

  @SkipThrottle()
  @Get('health/db')
  databaseHealth() {
    return this.appService.checkDatabase();
  }
}
