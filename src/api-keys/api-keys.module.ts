import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiKey } from './entities/api-key.entity';
import { Business } from '../businesses/entities/business.entity';
import { User } from '../users/entities/user.entity';
import { ApiKeysService } from './api-keys.service';
import { ApiKeysController } from './api-keys.controller';
import { AdminApiKeysController } from './admin-api-keys.controller';
import { MerchantApiCredentialsController } from './merchant-api-credentials.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ApiKey, Business, User])],
  controllers: [
    ApiKeysController,
    AdminApiKeysController,
    MerchantApiCredentialsController,
  ],
  providers: [ApiKeysService],
  exports: [ApiKeysService],
})
export class ApiKeysModule {}
