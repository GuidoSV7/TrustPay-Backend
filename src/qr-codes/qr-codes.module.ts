import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QrCode } from './entities/qr-code.entity';
import { Business } from '../businesses/entities/business.entity';
import { QrCodesService } from './qr-codes.service';
import { QrCodesController } from './qr-codes.controller';

@Module({
  imports: [TypeOrmModule.forFeature([QrCode, Business])],
  controllers: [QrCodesController],
  providers: [QrCodesService],
  exports: [QrCodesService],
})
export class QrCodesModule {}
