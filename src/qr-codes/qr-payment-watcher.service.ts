import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, Not } from 'typeorm';
import {
  findReference,
  validateTransfer,
  FindReferenceError,
  ValidateTransferError,
} from '@solana/pay';
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import BigNumber from 'bignumber.js';
import { QrCode } from './entities/qr-code.entity';
import { SolanaService } from '../solana/solana.service';
import { WebhookDeliveryService } from '../webhooks/webhook-delivery.service';

const PENDING_BATCH = 50;

/**
 * Sondea la RPC para el primer pago que referencia el pubkey del QR (Solana Pay).
 * MVP: solo el primer pago por QR dispara webhook y deja de sondear.
 */
@Injectable()
export class QrPaymentWatcherService {
  private readonly logger = new Logger(QrPaymentWatcherService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly solana: SolanaService,
    @InjectRepository(QrCode) private readonly qrRepo: Repository<QrCode>,
    private readonly webhookDelivery: WebhookDeliveryService,
  ) {}

  private amountForValidation(qr: QrCode): BigNumber {
    if (qr.tokenMint) {
      // SPL: sin decimales del mint en BD; validamos recipient + token + reference.
      return new BigNumber(0);
    }
    if (qr.amountLamports != null && String(qr.amountLamports).trim() !== '') {
      return new BigNumber(String(qr.amountLamports)).dividedBy(LAMPORTS_PER_SOL);
    }
    return new BigNumber(0);
  }

  @Cron(CronExpression.EVERY_30_SECONDS)
  async scanPendingPayments(): Promise<void> {
    if (this.config.get('PAYMENT_POLL_ENABLED') === 'false') {
      return;
    }

    const pending = await this.qrRepo.find({
      where: {
        paymentConfirmedAt: IsNull(),
        isActive: true,
        referencePubkey: Not(IsNull()),
      },
      relations: ['business'],
      order: { createdAt: 'ASC' },
      take: PENDING_BATCH,
    });

    const connection = this.solana.getConnection();

    for (const qr of pending) {
      if (!qr.referencePubkey || !qr.business) continue;

      try {
        const refPk = new PublicKey(qr.referencePubkey);
        const sigInfo = await findReference(connection, refPk, {
          finality: 'confirmed',
        });
        const signature = sigInfo.signature;

        const recipient = new PublicKey(qr.business.walletAddress);
        const amount = this.amountForValidation(qr);
        const splToken = qr.tokenMint
          ? new PublicKey(qr.tokenMint)
          : undefined;

        await validateTransfer(connection, signature, {
          recipient,
          amount,
          splToken,
          reference: refPk,
        });

        const updateResult = await this.qrRepo.update(
          { id: qr.id, paymentConfirmedAt: IsNull() },
          {
            paymentConfirmedAt: new Date(),
            paymentSignature: signature,
          },
        );

        if (!updateResult.affected) {
          continue;
        }

        await this.webhookDelivery.dispatch(qr.businessId, 'payment.confirmed', {
          qrCodeId: qr.id,
          businessId: qr.businessId,
          signature,
          referencePubkey: qr.referencePubkey,
          amountLamports: qr.amountLamports,
          tokenMint: qr.tokenMint,
          confirmedAt: new Date().toISOString(),
        });

        this.logger.log(
          `Pago confirmado QR ${qr.id} | sig ${signature.slice(0, 16)}…`,
        );
      } catch (e) {
        if (e instanceof FindReferenceError) {
          continue;
        }
        if (e instanceof ValidateTransferError) {
          this.logger.debug(
            `QR ${qr.id}: tx aún no válida para Solana Pay — ${e.message}`,
          );
          continue;
        }
        this.logger.warn(
          `QR ${qr.id}: error al verificar pago — ${(e as Error).message}`,
        );
      }
    }
  }
}
