import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as crypto from 'crypto';
import { Payment } from './entities/payment.entity';

/** Envía webhooks a payment.webhookUrl (plataforma externa) */
@Injectable()
export class PaymentWebhookService {
  private readonly logger = new Logger(PaymentWebhookService.name);

  async dispatch(payment: Payment, event: string, payload: Record<string, unknown>): Promise<void> {
    if (!payment.webhookUrl?.trim()) return;

    const body = {
      event,
      paymentId: payment.id,
      orderId: payment.orderId,
      status: payload.status ?? event.replace('escrow.', '').replace('payment.', ''),
      ...payload,
      timestamp: new Date().toISOString(),
    };
    const bodyStr = JSON.stringify(body);

    let signature: string | undefined;
    if (payment.webhookSecret?.trim()) {
      signature = crypto
        .createHmac('sha256', payment.webhookSecret)
        .update(bodyStr)
        .digest('hex');
    }

    try {
      const res = await axios.post(payment.webhookUrl, body, {
        headers: {
          'Content-Type': 'application/json',
          ...(signature && { 'X-TrustPay-Signature': signature }),
          'X-TrustPay-Event': event,
        },
        timeout: 10000,
        validateStatus: () => true,
      });
      if (res.status >= 200 && res.status < 300) {
        this.logger.debug(`Webhook ${event} enviado a ${payment.webhookUrl}`);
      } else {
        this.logger.warn(`Webhook ${event} -> ${payment.webhookUrl}: ${res.status}`);
      }
    } catch (err) {
      this.logger.warn(`Webhook ${event} -> ${payment.webhookUrl}: ${(err as Error).message}`);
    }
  }
}
