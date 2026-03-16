import { Controller, Post, HttpCode, HttpStatus, Get } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { SeederService } from './seeder.service';

@Controller('seed')
export class SeederController {
  constructor(private readonly seederService: SeederService) {}

  @Public()
  @Post()
  @HttpCode(HttpStatus.OK)
  async seed() {
    try {
      await this.seederService.seed();
      return {
        success: true,
        message: 'Seed TrustPay: usuarios admin + merchant',
      };
    } catch (error: any) {
      return {
        success: false,
        message: 'Error en seed',
        error: error?.message,
      };
    }
  }

  @Public()
  @Get()
  @HttpCode(HttpStatus.OK)
  async seedGet() {
    return this.seed();
  }
}
