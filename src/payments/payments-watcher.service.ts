import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, IsNull } from 'typeorm';
import { PublicKey } from '@solana/web3.js';
import { Payment } from './entities/payment.entity';
import { SolanaService } from '../solana/solana.service';
import { WebhookDeliveryService } from '../webhooks/webhook-delivery.service';
import { PaymentWebhookService } from './payment-webhook.service';

const BATCH_SIZE = 25;
const AUTO_RELEASE_DAYS = 7;

/**
 * Cron que detecta cuando un buyer creó el escrow on-chain.
 * Para cada payment pending con buyerWallet, verifica si la Escrow PDA existe y está LOCKED.
 */
@Injectable()
export class PaymentsWatcherService {
  private readonly logger = new Logger(PaymentsWatcherService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly solana: SolanaService,
    @InjectRepository(Payment) private readonly paymentRepo: Repository<Payment>,
    private readonly webhookDelivery: WebhookDeliveryService,
    private readonly paymentWebhook: PaymentWebhookService,
  ) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async scanEscrowCreated(): Promise<void> {
    if (this.config.get('PAYMENT_POLL_ENABLED') === 'false') {
      return;
    }

    const payments = await this.paymentRepo.find({
      where: {
        status: 'pending',
        buyerWallet: Not(IsNull()),
      },
      relations: ['business'],
      take: BATCH_SIZE,
      order: { updatedAt: 'ASC' },
    });

    const pendingWithBuyer = payments;
    if (pendingWithBuyer.length === 0) return;

    for (const payment of pendingWithBuyer) {
      if (!payment.buyerWallet) continue;

      try {
        const buyer = new PublicKey(payment.buyerWallet);
        const isLocked = await this.solana.isEscrowLocked(
          buyer,
          payment.transactionId,
        );

        if (!isLocked) continue;

        const [escrowPda] = this.solana.getEscrowPda(
          buyer,
          payment.transactionId,
        );

        let txSignature: string | null = null;
        try {
          const conn = this.solana.getConnection();
          const sigs = await conn.getSignaturesForAddress(escrowPda, {
            limit: 1,
          });
          if (sigs.length > 0) txSignature = sigs[0].signature;
        } catch {
          // ignorar si falla obtener la firma
        }

        const paidAt = new Date();

        await this.paymentRepo.update(
          { id: payment.id },
          {
            status: 'escrow_locked',
            escrowPda: escrowPda.toBase58(),
            paidAt,
            blockchainTxCreate: txSignature,
          },
        );

        const amountSol =
          Number(BigInt(payment.amountLamports)) / 1_000_000_000;

        const payload = {
          paymentId: payment.id,
          orderId: payment.orderId,
          status: 'escrow_locked',
          amount: amountSol,
          escrowPda: escrowPda.toBase58(),
          txHash: txSignature,
          paidAt: paidAt.toISOString(),
        };
        await this.webhookDelivery.dispatch(payment.businessId, 'escrow.locked', payload);
        await this.paymentWebhook.dispatch(
          await this.paymentRepo.findOneOrFail({ where: { id: payment.id } }),
          'escrow.locked',
          payload,
        );

        this.logger.log(
          `Escrow locked: payment ${payment.id} | PDA ${escrowPda.toBase58().slice(0, 12)}…`,
        );
      } catch (err) {
        this.logger.warn(
          `Payment ${payment.id}: error verificando escrow — ${(err as Error).message}`,
        );
      }
    }
  }

  @Cron(CronExpression.EVERY_30_SECONDS)
  async scanEscrowReleased(): Promise<void> {
    if (this.config.get('PAYMENT_POLL_ENABLED') === 'false') {
      return;
    }

    const payments = await this.paymentRepo.find({
      where: [
        { status: 'escrow_locked' },
        { status: 'shipped' },
      ],
      relations: ['business'],
      take: BATCH_SIZE,
    });

    for (const payment of payments) {
      if (!payment.buyerWallet) continue;

      try {
        const buyer = new PublicKey(payment.buyerWallet);
        const isReleased = await this.solana.isEscrowReleased(
          buyer,
          payment.transactionId,
        );

        if (!isReleased) continue;

        let txSignature: string | null = null;
        try {
          const [escrowPda] = this.solana.getEscrowPda(
            buyer,
            payment.transactionId,
          );
          const conn = this.solana.getConnection();
          const sigs = await conn.getSignaturesForAddress(escrowPda, {
            limit: 2,
          });
          txSignature = sigs.find((s) => !s.err)?.signature ?? sigs[0]?.signature ?? null;
        } catch {
          //
        }

        const releasedAt = new Date();

        await this.paymentRepo.update(
          { id: payment.id },
          {
            status: 'released',
            releasedAt,
            blockchainTxRelease: txSignature,
          },
        );

        const amountSol =
          Number(BigInt(payment.amountLamports)) / 1_000_000_000;

        const releasedPayload = {
          paymentId: payment.id,
          orderId: payment.orderId,
          status: 'released',
          amount: amountSol,
          txHash: txSignature,
          releasedAt: releasedAt.toISOString(),
        };
        await this.webhookDelivery.dispatch(payment.businessId, 'escrow.released', releasedPayload);
        await this.paymentWebhook.dispatch(
          await this.paymentRepo.findOneOrFail({ where: { id: payment.id } }),
          'escrow.released',
          releasedPayload,
        );

        this.logger.log(`Escrow released: payment ${payment.id}`);
      } catch (err) {
        this.logger.warn(
          `Payment ${payment.id}: error verificando release — ${(err as Error).message}`,
        );
      }
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async scanExpired(): Promise<void> {
    const payments = await this.paymentRepo.find({
      where: {
        status: 'pending',
      },
      relations: ['business'],
      take: BATCH_SIZE,
    });

    const now = new Date();
    for (const payment of payments) {
      if (!payment.expiresAt || payment.expiresAt > now) continue;

      await this.paymentRepo.update(
        { id: payment.id },
        { status: 'expired' },
      );

      const expiredPayload = {
        paymentId: payment.id,
        orderId: payment.orderId,
        status: 'expired',
      };
      await this.webhookDelivery.dispatch(payment.businessId, 'payment.expired', expiredPayload);
      await this.paymentWebhook.dispatch(payment, 'payment.expired', expiredPayload);

      this.logger.log(`Payment expired: ${payment.id}`);
    }
  }

  /**
   * Auto-liberación: a los 7 días de shipped, marca como auto_released.
   * NOTA: El contrato actual requiere que el buyer firme liberar_escrow.
   * Para liberación on-chain automática se necesitaría una nueva instrucción en el contrato.
   * Por ahora solo actualizamos el estado en BD y disparamos webhook.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async scanAutoRelease(): Promise<void> {
    const payments = await this.paymentRepo.find({
      where: { status: 'shipped' },
      relations: ['business'],
      take: BATCH_SIZE,
    });

    const now = new Date();
    for (const payment of payments) {
      if (!payment.autoReleaseAt || payment.autoReleaseAt > now) continue;

      await this.paymentRepo.update(
        { id: payment.id },
        { status: 'auto_released', releasedAt: now },
      );

      const amountSol = Number(BigInt(payment.amountLamports)) / 1_000_000_000;
      const payload = {
        paymentId: payment.id,
        orderId: payment.orderId,
        status: 'auto_released',
        amount: amountSol,
        releasedAt: now.toISOString(),
      };
      await this.webhookDelivery.dispatch(
        payment.businessId,
        'escrow.auto_released',
        payload,
      );
      await this.paymentWebhook.dispatch(payment, 'escrow.auto_released', payload);

      this.logger.log(`Auto-released: payment ${payment.id}`);
    }
  }
}
