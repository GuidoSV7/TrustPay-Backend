import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QrCode } from './entities/qr-code.entity';
import { Business } from '../businesses/entities/business.entity';
import { QrCodesService } from './qr-codes.service';
import { QrCodesController } from './qr-codes.controller';
import { BusinessQrsController } from './business-qrs.controller';
import { SolanaModule } from '../solana/solana.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { QrPaymentWatcherService } from './qr-payment-watcher.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([QrCode, Business]),
    SolanaModule,
    WebhooksModule,
  ],
  controllers: [QrCodesController, BusinessQrsController],
  providers: [QrCodesService, QrPaymentWatcherService],
  exports: [QrCodesService],
})
export class QrCodesModule {}
