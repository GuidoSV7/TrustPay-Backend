import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, LessThanOrEqual } from 'typeorm';
import axios from 'axios';
import * as crypto from 'crypto';
import { WebhookDelivery } from './entities/webhook-delivery.entity';
import { WebhookEndpoint } from './entities/webhook-endpoint.entity';

const MAX_ATTEMPTS = 5;
const RETRY_MINUTES = [1, 5, 15, 60, 360];

@Injectable()
export class WebhookDeliveryService {
  private readonly logger = new Logger(WebhookDeliveryService.name);

  constructor(
    @InjectRepository(WebhookDelivery)
    private readonly deliveryRepo: Repository<WebhookDelivery>,
    @InjectRepository(WebhookEndpoint)
    private readonly endpointRepo: Repository<WebhookEndpoint>,
  ) {}

  signPayload(body: string, secret: string): string {
    return crypto.createHmac('sha256', secret).update(body).digest('hex');
  }

  async dispatch(
    businessId: string,
    eventType: string,
    payload: Record<string, unknown>,
  ) {
    const endpoints = await this.endpointRepo.find({
      where: { businessId, isActive: true },
      relations: ['subscriptions'],
    });
    const envelope = {
      type: eventType,
      data: payload,
      created_at: new Date().toISOString(),
    };
    const bodyStr = JSON.stringify(envelope);

    for (const ep of endpoints) {
      if (!ep.subscriptions?.some((s) => s.eventType === eventType)) continue;

      const delivery = this.deliveryRepo.create({
        endpointId: ep.id,
        eventType,
        payload: envelope as any,
        attemptNumber: 1,
      });
      await this.deliveryRepo.save(delivery);
      await this.tryDeliverOnce(delivery, ep, bodyStr);
    }
  }

  private async tryDeliverOnce(
    delivery: WebhookDelivery,
    ep: WebhookEndpoint,
    bodyStr: string,
  ) {
    const sig = this.signPayload(bodyStr, ep.secretHash);
    try {
      const res = await axios.post(ep.url, JSON.parse(bodyStr), {
        headers: {
          'Content-Type': 'application/json',
          'X-TrustPay-Signature': sig,
          'X-TrustPay-Event': delivery.eventType,
        },
        timeout: 10000,
        validateStatus: () => true,
      });
      delivery.responseStatus = res.status;
      delivery.responseBody =
        typeof res.data === 'string'
          ? res.data
          : JSON.stringify(res.data).slice(0, 2000);
      if (res.status >= 200 && res.status < 300) {
        delivery.deliveredAt = new Date();
        delivery.nextRetryAt = null;
      } else {
        this.scheduleRetry(delivery);
      }
    } catch (err: any) {
      delivery.responseStatus = err.response?.status ?? 0;
      delivery.responseBody = (err.message || 'error').slice(0, 2000);
      this.scheduleRetry(delivery);
      this.logger.warn(`Webhook ${ep.url}: ${err.message}`);
    }
    await this.deliveryRepo.save(delivery);
  }

  private scheduleRetry(d: WebhookDelivery) {
    const idx = d.attemptNumber - 1;
    if (idx >= MAX_ATTEMPTS - 1) {
      d.nextRetryAt = null;
      this.logger.warn(`Delivery ${d.id} sin más reintentos`);
      return;
    }
    const mins = RETRY_MINUTES[idx] ?? 60;
    d.nextRetryAt = new Date(Date.now() + mins * 60 * 1000);
    d.attemptNumber = d.attemptNumber + 1;
  }

  async processPendingRetries() {
    const now = new Date();
    const pending = await this.deliveryRepo.find({
      where: {
        deliveredAt: IsNull(),
        nextRetryAt: LessThanOrEqual(now),
      },
      take: 50,
    });
    for (const d of pending) {
      const ep = await this.endpointRepo.findOne({
        where: { id: d.endpointId },
      });
      if (!ep?.isActive) continue;
      const bodyStr = JSON.stringify(d.payload);
      const next = d.nextRetryAt;
      d.nextRetryAt = null;
      await this.deliveryRepo.save(d);
      if (next && d.attemptNumber <= MAX_ATTEMPTS) {
        await this.tryDeliverOnce(d, ep, bodyStr);
      }
    }
  }
}
