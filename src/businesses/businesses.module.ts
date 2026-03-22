import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Business } from './entities/business.entity';
import { BusinessesService } from './businesses.service';
import { BusinessesController } from './businesses.controller';
import { SolanaModule } from '../solana/solana.module';

@Module({
  imports: [TypeOrmModule.forFeature([Business]), SolanaModule],
  controllers: [BusinessesController],
  providers: [BusinessesService],
  exports: [BusinessesService],
})
export class BusinessesModule {}
