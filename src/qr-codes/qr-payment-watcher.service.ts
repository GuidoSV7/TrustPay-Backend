import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, Not } from 'typeorm';
import {
  validateTransfer,
  ValidateTransferError,
} from '@solana/pay';
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import BigNumber from 'bignumber.js';
import { QrCode } from './entities/qr-code.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { SolanaService } from '../solana/solana.service';
import { WebhookDeliveryService } from '../webhooks/webhook-delivery.service';

const QR_BATCH = 25;
const SIG_LIMIT = 50;

/**
 * Sondea la RPC por firmas que referencian el pubkey del QR; persiste cada transacción en `transactions`.
 * El primer pago por QR también actualiza `qr_codes` y dispara webhook `payment.confirmed`.
 */
@Injectable()
export class QrPaymentWatcherService {
  private readonly logger = new Logger(QrPaymentWatcherService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly solana: SolanaService,
    @InjectRepository(QrCode) private readonly qrRepo: Repository<QrCode>,
    @InjectRepository(Transaction) private readonly transactionRepo: Repository<Transaction>,
    private readonly webhookDelivery: WebhookDeliveryService,
  ) {}

  private amountForValidation(qr: QrCode): BigNumber {
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

    const qrs = await this.qrRepo.find({
      where: {
        isActive: true,
        referencePubkey: Not(IsNull()),
      },
      relations: ['business'],
      order: { updatedAt: 'ASC' },
      take: QR_BATCH,
    });

    const connection = this.solana.getConnection();

    for (const qr of qrs) {
      if (!qr.referencePubkey || !qr.business) continue;
      if (qr.tokenMint) {
        this.logger.debug(
          `QR ${qr.id}: SPL no soportado; omitiendo`,
        );
        continue;
      }

      const refPk = new PublicKey(qr.referencePubkey);
      let sigs: { signature: string }[];
      try {
        sigs = await connection.getSignaturesForAddress(
          refPk,
          { limit: SIG_LIMIT },
          'confirmed',
        );
      } catch (e) {
        this.logger.warn(
          `QR ${qr.id}: getSignaturesForAddress — ${(e as Error).message}`,
        );
        continue;
      }

      const chronological = [...sigs].reverse();

      let firstForQrHandled = !!qr.paymentConfirmedAt;

      for (const sigInfo of chronological) {
        const already = await this.transactionRepo.findOne({
          where: { signature: sigInfo.signature },
          select: ['id'],
        });
        if (already) continue;

        const recipient = new PublicKey(qr.business.walletAddress);
        const amount = this.amountForValidation(qr);

        let txResponse: Awaited<ReturnType<typeof validateTransfer>>;
        try {
          txResponse = await validateTransfer(connection, sigInfo.signature, {
            recipient,
            amount,
            reference: refPk,
          });
        } catch (e) {
          if (e instanceof ValidateTransferError) {
            this.logger.debug(
              `QR ${qr.id} sig ${sigInfo.signature.slice(0, 8)}…: ${e.message}`,
            );
            continue;
          }
          throw e;
        }

        const slot =
          txResponse.slot != null ? String(txResponse.slot) : null;
        const blockTime = (txResponse as { blockTime?: number | null })
          .blockTime;
        const confirmedAt =
          blockTime != null
            ? new Date(blockTime * 1000)
            : new Date();

        const row = this.transactionRepo.create({
          businessId: qr.businessId,
          qrCodeId: qr.id,
          signature: sigInfo.signature,
          referencePubkey: qr.referencePubkey,
          amountLamports: qr.amountLamports,
          tokenMint: qr.tokenMint,
          slot,
          confirmedAt,
        });

        try {
          await this.transactionRepo.save(row);
        } catch (err: unknown) {
          if ((err as { code?: string })?.code === '23505') {
            continue;
          }
          throw err;
        }

        if (!firstForQrHandled) {
          const updateResult = await this.qrRepo.update(
            { id: qr.id },
            {
              paymentConfirmedAt: confirmedAt,
              paymentSignature: sigInfo.signature,
            },
          );
          if (updateResult.affected) {
            firstForQrHandled = true;
            await this.webhookDelivery.dispatch(qr.businessId, 'payment.confirmed', {
              qrCodeId: qr.id,
              businessId: qr.businessId,
              signature: sigInfo.signature,
              referencePubkey: qr.referencePubkey,
              amountLamports: qr.amountLamports,
              tokenMint: qr.tokenMint,
              confirmedAt: confirmedAt.toISOString(),
            });
            this.logger.log(
              `Primer pago QR ${qr.id} | sig ${sigInfo.signature.slice(0, 16)}…`,
            );
          }
        } else {
          this.logger.log(
            `Pago adicional QR ${qr.id} | sig ${sigInfo.signature.slice(0, 16)}…`,
          );
        }
      }
    }
  }
}
