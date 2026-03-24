import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiKey } from './entities/api-key.entity';
import { Business } from '../businesses/entities/business.entity';
import { ApiKeysService } from './api-keys.service';
import { ApiKeysController } from './api-keys.controller';
import { AdminApiKeysController } from './admin-api-keys.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ApiKey, Business])],
  controllers: [ApiKeysController, AdminApiKeysController],
  providers: [ApiKeysService],
  exports: [ApiKeysService],
})
export class ApiKeysModule {}
