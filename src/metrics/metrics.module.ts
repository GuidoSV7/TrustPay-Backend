import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Payment } from '../payments/entities/payment.entity';
import { Business } from '../businesses/entities/business.entity';
import { User } from '../users/entities/user.entity';
import { PlatformSettings } from '../platform-settings/entities/platform-settings.entity';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service';
import { AdminPlatformSettingsController } from '../platform-settings/admin-platform-settings.controller';
import { MetricsService } from './metrics.service';
import { MerchantMetricsController } from './merchant-metrics.controller';
import { AdminMetricsController } from './admin-metrics.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment, Business, User, PlatformSettings]),
  ],
  controllers: [
    AdminPlatformSettingsController,
    MerchantMetricsController,
    AdminMetricsController,
  ],
  providers: [PlatformSettingsService, MetricsService],
  exports: [PlatformSettingsService, MetricsService],
})
export class MetricsModule {}
