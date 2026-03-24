import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Business } from './entities/business.entity';
import { BusinessesService } from './businesses.service';
import { BusinessesController } from './businesses.controller';
import { ApiPublicBusinessesController } from './api-public-businesses.controller';
import { SolanaModule } from '../solana/solana.module';
import { ApiKeysModule } from '../api-keys/api-keys.module';

@Module({
  imports: [TypeOrmModule.forFeature([Business]), SolanaModule, ApiKeysModule],
  controllers: [BusinessesController, ApiPublicBusinessesController],
  providers: [BusinessesService],
  exports: [BusinessesService],
})
export class BusinessesModule {}
