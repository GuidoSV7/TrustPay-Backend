import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { Payment } from './entities/payment.entity';
import { Business } from '../businesses/entities/business.entity';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { TxController } from './tx.controller';
import { BusinessPaymentsController } from './business-payments.controller';
import { PaymentsWatcherService } from './payments-watcher.service';
import { PaymentWebhookService } from './payment-webhook.service';
import { SolanaModule } from '../solana/solana.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { MetricsModule } from '../metrics/metrics.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment, Business]),
    ConfigModule,
    SolanaModule,
    WebhooksModule,
    ApiKeysModule,
    MetricsModule,
  ],
  controllers: [PaymentsController, TxController, BusinessPaymentsController],
  providers: [PaymentWebhookService, PaymentsService, PaymentsWatcherService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
