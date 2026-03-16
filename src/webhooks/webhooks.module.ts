import { Module, Injectable, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WebhookEndpoint } from './entities/webhook-endpoint.entity';
import { WebhookSubscription } from './entities/webhook-subscription.entity';
import { WebhookDelivery } from './entities/webhook-delivery.entity';
import { Business } from '../businesses/entities/business.entity';
import { WebhooksService } from './webhooks.service';
import { WebhookDeliveryService } from './webhook-delivery.service';
import { WebhooksController } from './webhooks.controller';

@Injectable()
class WebhookRetryScheduler implements OnModuleInit {
  constructor(private readonly delivery: WebhookDeliveryService) {}
  onModuleInit() {
    setInterval(() => {
      this.delivery.processPendingRetries().catch(() => {});
    }, 60_000);
  }
}

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WebhookEndpoint,
      WebhookSubscription,
      WebhookDelivery,
      Business,
    ]),
  ],
  controllers: [WebhooksController],
  providers: [WebhooksService, WebhookDeliveryService, WebhookRetryScheduler],
  exports: [WebhooksService, WebhookDeliveryService],
})
export class WebhooksModule {}
