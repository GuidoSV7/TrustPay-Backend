import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { randomUUID } from 'crypto';
import { Payment } from './entities/payment.entity';
import { Business } from '../businesses/entities/business.entity';
import { SolanaPayQrService } from '../solana/solana-pay-qr.service';
import { SolanaService } from '../solana/solana.service';
import { WebhookDeliveryService } from '../webhooks/webhook-delivery.service';
import { PaymentWebhookService } from './payment-webhook.service';
import type { CreatePaymentQrDto } from './schemas/create-payment-qr.schema';
import { UserRole } from '../users/entities/user.entity';
import { ApiKey } from '../api-keys/entities/api-key.entity';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service';

const LAMPORTS_PER_SOL = 1_000_000_000;

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectRepository(Payment) private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(Business) private readonly businessRepo: Repository<Business>,
    private readonly config: ConfigService,
    private readonly solanaPayQr: SolanaPayQrService,
    private readonly solana: SolanaService,
    private readonly webhookDelivery: WebhookDeliveryService,
    private readonly paymentWebhook: PaymentWebhookService,
    private readonly platformSettings: PlatformSettingsService,
  ) {}

  /** Monto del pedido (vendedor); el comprador paga esto + comisión en la misma tx. */
  private computeCommissionLamports(
    baseLamports: bigint,
    commissionBps: number,
  ): bigint {
    if (commissionBps <= 0) return 0n;
    return (baseLamports * BigInt(commissionBps)) / 10000n;
  }

  private getFeeRecipientPubkey(): PublicKey {
    const raw = this.config.get<string>('PLATFORM_FEE_WALLET');
    if (raw?.trim()) {
      try {
        return new PublicKey(raw.trim());
      } catch {
        this.logger.warn(
          `PLATFORM_FEE_WALLET inválida, se usa la authority TrustPay`,
        );
      }
    }
    return this.solana.getAuthorityPublicKey();
  }

  private getApiBaseUrl(): string {
    return (
      this.config.get('API_BASE_URL') ??
      `http://localhost:${this.config.get('PORT') ?? 3001}`
    );
  }

  private async assertBusinessAccess(
    businessId: string,
    userId: string,
    role: string,
  ) {
    const b = await this.businessRepo.findOne({ where: { id: businessId } });
    if (!b) throw new NotFoundException('Negocio no encontrado');
    if (role !== UserRole.ADMIN && b.userId !== userId) {
      throw new ForbiddenException('No autorizado');
    }
    if (!b.isActive && role !== UserRole.ADMIN) {
      throw new BadRequestException('El negocio está desactivado');
    }
    return b;
  }

  /** Clave por negocio o credencial general (userId). */
  assertApiKeyCanAccessPayment(apiKey: ApiKey, payment: Payment): void {
    if (apiKey.businessId) {
      if (payment.businessId !== apiKey.businessId) {
        throw new ForbiddenException('No autorizado');
      }
      return;
    }
    if (apiKey.userId) {
      const ownerId = payment.business?.userId;
      if (!ownerId || ownerId !== apiKey.userId) {
        throw new ForbiddenException('No autorizado');
      }
      return;
    }
    throw new ForbiddenException('API key inválida');
  }

  /**
   * Credencial general: exige businessId en el body. Clave por negocio: usa el negocio de la clave.
   */
  async resolveBusinessIdForApiKey(
    apiKey: ApiKey,
    dto: CreatePaymentQrDto,
  ): Promise<string> {
    if (apiKey.businessId) {
      return apiKey.businessId;
    }
    if (!apiKey.userId) {
      throw new BadRequestException('API key inválida');
    }
    const bid = dto.businessId;
    if (!bid) {
      throw new BadRequestException(
        'Enviá businessId en el cuerpo JSON para indicar el negocio (credenciales generales de cuenta).',
      );
    }
    const b = await this.businessRepo.findOne({ where: { id: bid } });
    if (!b || b.userId !== apiKey.userId) {
      throw new ForbiddenException('Negocio no autorizado para esta clave');
    }
    return bid;
  }

  async getPaymentStatusForApiKey(paymentId: string, apiKey: ApiKey) {
    const payment = await this.paymentRepo.findOne({
      where: { id: paymentId },
      relations: ['business'],
    });
    if (!payment) throw new NotFoundException('Pago no encontrado');
    this.assertApiKeyCanAccessPayment(apiKey, payment);
    return this.getPaymentStatus(paymentId, payment.businessId);
  }

  async shipPaymentForApiKey(
    paymentId: string,
    apiKey: ApiKey,
    dto: { trackingNumber?: string | null; note?: string | null },
  ) {
    const payment = await this.paymentRepo.findOne({
      where: { id: paymentId },
      relations: ['business'],
    });
    if (!payment) throw new NotFoundException('Pago no encontrado');
    this.assertApiKeyCanAccessPayment(apiKey, payment);
    return this.shipPayment(paymentId, payment.businessId, dto);
  }

  /**
   * Crea un pago con QR en modo Transaction Request (escrow).
   * Auth: API Key (businessId del key) o JWT (businessId del path).
   */
  async createPaymentQr(
    businessId: string,
    dto: CreatePaymentQrDto,
    options?: {
      useBusinessWallet?: boolean;
      userId?: string;
      userRole?: string;
    },
  ): Promise<{
    paymentId: string;
    transactionId: string;
    orderId: string | null;
    /** Monto del pedido (vendedor / escrow), en SOL. */
    amount: number;
    amountLamports: string;
    /** Comisión TrustPay en SOL (adicional al comprador). */
    commissionAmount: number;
    commissionLamports: string;
    /** Total que paga el comprador (pedido + comisión). */
    totalAmount: number;
    totalLamports: string;
    commissionBps: number;
    status: string;
    solanaPayUrl: string;
    qrImageBase64: string;
    expiresAt: Date;
    createdAt: Date;
  }> {
    if (options?.userId != null && options?.userRole != null) {
      await this.assertBusinessAccess(
        businessId,
        options.userId,
        options.userRole,
      );
    }

    const business = await this.businessRepo.findOne({
      where: { id: businessId },
      relations: ['user'],
    });
    if (!business) throw new NotFoundException('Negocio no encontrado');
    if (!business.isVerified) {
      throw new BadRequestException(
        'El negocio debe estar verificado on-chain antes de crear pagos con escrow',
      );
    }

    const sellerWallet =
      dto.sellerWallet?.trim() || business.walletAddress;

    // UUID sin guiones = 32 caracteres = 32 bytes (límite de seed PDA en Solana).
    // randomUUID() con guiones son 36 bytes y rompe findProgramAddress / Anchor seeds.
    const transactionId = randomUUID().replace(/-/g, '');
    const commissionBps = await this.platformSettings.getCommissionBps();
    const baseLamports = BigInt(Math.floor(dto.amount * LAMPORTS_PER_SOL));
    const feeLamports = this.computeCommissionLamports(
      baseLamports,
      commissionBps,
    );
    const expiresAt = new Date(Date.now() + dto.expiresInMinutes * 60 * 1000);

    const payment = this.paymentRepo.create({
      businessId,
      transactionId,
      orderId: dto.orderId,
      sellerWallet,
      amountLamports: baseLamports.toString(),
      commissionLamports:
        feeLamports > 0n ? feeLamports.toString() : null,
      tokenMint: null,
      webhookUrl: dto.webhookUrl,
      webhookSecret: dto.webhookSecret ?? null,
      description: dto.description,
      status: 'pending',
      solanaPayUrl: 'placeholder',
      qrImageUrl: null,
      expiresAt,
    });
    const savedTemp = await this.paymentRepo.save(payment);

    const baseUrl = this.getApiBaseUrl().replace(/\/$/, '');
    const txLink = `${baseUrl}/tx/${savedTemp.id}`;

    const { solanaPayUrl, qrImageDataUrl } =
      await this.solanaPayQr.buildEscrowTransactionRequestQr(
        txLink,
        business.name,
        dto.description ?? `TrustPay · Pago protegido`,
      );

    savedTemp.solanaPayUrl = solanaPayUrl;
    savedTemp.qrImageUrl = qrImageDataUrl;
    const saved = await this.paymentRepo.save(savedTemp);

    const totalLamports = baseLamports + feeLamports;
    const feeSol = Number(feeLamports) / LAMPORTS_PER_SOL;
    const totalSol = Number(totalLamports) / LAMPORTS_PER_SOL;

    this.logger.log(
      `Payment creado: ${saved.id} | txId: ${transactionId} | business: ${businessId} | baseLamports=${baseLamports} feeLamports=${feeLamports}`,
    );

    return {
      paymentId: saved.id,
      transactionId,
      orderId: saved.orderId,
      amount: dto.amount,
      amountLamports: baseLamports.toString(),
      commissionAmount: feeSol,
      commissionLamports: feeLamports.toString(),
      totalAmount: totalSol,
      totalLamports: totalLamports.toString(),
      commissionBps,
      status: saved.status,
      solanaPayUrl: saved.solanaPayUrl,
      qrImageBase64: saved.qrImageUrl ?? '',
      expiresAt: saved.expiresAt!,
      createdAt: saved.createdAt,
    };
  }

  /**
   * GET /tx/:paymentId — Phantom llama para obtener label e icon.
   * Público.
   */
  async getTxInfo(paymentId: string): Promise<{ label: string; icon: string }> {
    const payment = await this.paymentRepo.findOne({
      where: { id: paymentId },
      relations: ['business'],
    });
    if (!payment) throw new NotFoundException('Pago no encontrado');
    if (payment.status !== 'pending') {
      throw new BadRequestException('Este pago ya no está pendiente');
    }
    if (payment.expiresAt && payment.expiresAt < new Date()) {
      throw new BadRequestException('El pago ha expirado');
    }

    return {
      label: payment.business?.name ?? 'TrustPay',
      icon: payment.business?.logoUrl ?? '',
    };
  }

  /**
   * Resuelve payment por id o por transactionId (usado en la URL del QR).
   */
  private async findPaymentByIdOrTransactionId(
    idOrTxId: string,
  ): Promise<Payment> {
    const byId = await this.paymentRepo.findOne({
      where: { id: idOrTxId },
      relations: ['business'],
    });
    if (byId) return byId;
    const byTxId = await this.paymentRepo.findOne({
      where: { transactionId: idOrTxId },
      relations: ['business'],
    });
    if (byTxId) return byTxId;
    throw new NotFoundException('Pago no encontrado');
  }

  /**
   * POST /tx/:paymentId — Phantom llama con account (buyer wallet).
   * Devuelve la transacción crear_escrow serializada en Base64.
   * Público.
   */
  async buildEscrowTransaction(
    paymentIdOrTxId: string,
    buyerWallet: string,
  ): Promise<{ transaction: string; message: string }> {
    const payment = await this.findPaymentByIdOrTransactionId(paymentIdOrTxId);
    if (payment.status !== 'pending') {
      throw new BadRequestException('Este pago ya no está pendiente');
    }
    if (payment.expiresAt && payment.expiresAt < new Date()) {
      throw new BadRequestException('El pago ha expirado');
    }
    if (payment.tokenMint) {
      throw new BadRequestException('Solo pagos en SOL nativo están soportados');
    }

    const buyer = new PublicKey(buyerWallet.trim());
    const seller = new PublicKey(payment.sellerWallet);
    const amount = BigInt(payment.amountLamports);
    const feeLamports = payment.commissionLamports
      ? BigInt(payment.commissionLamports)
      : 0n;

    const tx = this.solana.buildCrearEscrowTransaction(
      buyer,
      seller,
      payment.transactionId,
      amount,
    );

    if (feeLamports > 0n) {
      const feeRecipient = this.getFeeRecipientPubkey();
      tx.add(
        SystemProgram.transfer({
          fromPubkey: buyer,
          toPubkey: feeRecipient,
          lamports: feeLamports,
        }),
      );
    }

    const connection = this.solana.getConnection();
    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;
    tx.feePayer = buyer;

    // Diagnóstico: si Phantom falla al "Confirmar", suele ser simulación on-chain (red/SOL/programa).
    try {
      const sim = await connection.simulateTransaction(tx);
      if (sim.value.err) {
        this.logger.warn(
          `[Phantom] Simulación crear_escrow falló (mismo motivo que en la wallet): ${JSON.stringify(sim.value.err)}`,
        );
        const logs = sim.value.logs?.slice(-20) ?? [];
        if (logs.length) {
          this.logger.warn(`[Phantom] Logs programa: ${logs.join(' | ')}`);
        }
      }
    } catch (simErr) {
      this.logger.warn(
        `[Phantom] simulateTransaction no disponible: ${simErr instanceof Error ? simErr.message : String(simErr)}`,
      );
    }

    // Guardamos buyerWallet para que el cron pueda verificar la PDA
    await this.paymentRepo.update(
      { id: payment.id },
      { buyerWallet: buyerWallet.trim() },
    );

    const serialized = tx.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });
    const base64 = Buffer.from(serialized).toString('base64');
    const message =
      payment.description ??
      `Pago protegido por TrustPay — ${payment.business?.name ?? ''}`;

    return {
      transaction: base64,
      message,
    };
  }

  /**
   * POST /api/payments/:paymentId/confirm — Buyer confirma recepción, libera escrow.
   * Requiere JWT. El user.walletAddress debe coincidir con payment.buyerWallet.
   * Para el flujo con JWT: el backend NO puede firmar por el buyer.
   * El buyer debe firmar en el frontend y enviar la tx firmada, O el endpoint
   * devuelve la tx sin firmar para que el frontend la firme y envíe.
   *
   * Según el PRD: "TrustPay llama a liberar_escrow" - el backend construye la tx.
   * El buyer firma con Phantom. Así que el flujo es:
   * 1. Frontend llama POST /api/payments/:id/confirm con JWT (user = buyer)
   * 2. Backend devuelve la transacción serializada para que el frontend la firme con Phantom
   * 3. El frontend firma y envía la tx a Solana
   * 4. Cuando la tx confirma, un cron o el frontend puede hacer polling a GET /api/payments/:id
   *
   * O: el backend espera que el frontend envíe la tx YA FIRMADA, y el backend la envía.
   * La segunda opción es más común: el backend construye, el cliente firma, el cliente envía.
   * O el cliente podría enviar la signed tx al backend para que la reenvíe (redundante).
   *
   */
  /**
   * Obtiene la transacción liberar_escrow para que el buyer la firme con Phantom.
   * El user.walletAddress debe coincidir con payment.buyerWallet.
   */
  async getConfirmTransaction(
    paymentId: string,
    buyerWallet: string,
  ): Promise<{ transaction: string; message: string }> {
    const payment = await this.paymentRepo.findOne({
      where: { id: paymentId },
      relations: ['business'],
    });
    if (!payment) throw new NotFoundException('Pago no encontrado');
    if (payment.status !== 'escrow_locked' && payment.status !== 'shipped') {
      throw new BadRequestException(
        `Solo se puede confirmar un pago en estado escrow_locked o shipped. Actual: ${payment.status}`,
      );
    }
    if (payment.buyerWallet?.toLowerCase() !== buyerWallet.toLowerCase()) {
      throw new ForbiddenException(
        'Solo el comprador puede confirmar la recepción',
      );
    }

    const buyer = new PublicKey(buyerWallet);
    const seller = new PublicKey(payment.sellerWallet);
    const tx = this.solana.buildLiberarEscrowTransaction(
      buyer,
      seller,
      payment.transactionId,
    );

    const connection = this.solana.getConnection();
    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;
    tx.feePayer = buyer;

    const serialized = tx.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });
    const base64 = Buffer.from(serialized).toString('base64');

    return {
      transaction: base64,
      message: `Liberar pago a ${payment.business?.name ?? 'vendedor'}`,
    };
  }

  async getPaymentById(
    paymentId: string,
    businessId?: string,
  ): Promise<Payment | null> {
    const where: { id: string; businessId?: string } = { id: paymentId };
    if (businessId) where.businessId = businessId;
    return this.paymentRepo.findOne({ where, relations: ['business'] });
  }

  async getPaymentStatus(paymentId: string, businessId?: string) {
    const where: { id: string; businessId?: string } = { id: paymentId };
    if (businessId) where.businessId = businessId;
    const payment = await this.paymentRepo.findOne({
      where,
      relations: ['business'],
    });
    if (!payment) throw new NotFoundException('Pago no encontrado');

    const amountSol =
      Number(BigInt(payment.amountLamports)) / LAMPORTS_PER_SOL;
    const commissionSol = payment.commissionLamports
      ? Number(BigInt(payment.commissionLamports)) / LAMPORTS_PER_SOL
      : 0;

    return {
      paymentId: payment.id,
      orderId: payment.orderId,
      status: payment.status,
      amount: amountSol,
      commissionAmount: commissionSol,
      totalAmount: amountSol + commissionSol,
      escrowPda: payment.escrowPda,
      autoReleaseAt: payment.autoReleaseAt?.toISOString(),
      txHash:
        payment.blockchainTxCreate ??
        payment.blockchainTxRelease ??
        payment.blockchainTxRefund,
      paidAt: payment.paidAt?.toISOString(),
      shippedAt: payment.shippedAt?.toISOString(),
      releasedAt: payment.releasedAt?.toISOString(),
      createdAt: payment.createdAt?.toISOString(),
    };
  }

  /**
   * POST /api/payments/:paymentId/ship — Seller marca como enviado.
   * Activa el contador de auto-liberación (7 días).
   */
  async shipPayment(
    paymentId: string,
    businessId: string,
    dto: { trackingNumber?: string | null; note?: string | null },
    options?: { userId?: string; userRole?: string },
  ) {
    if (options?.userId != null && options?.userRole != null) {
      await this.assertBusinessAccess(
        businessId,
        options.userId,
        options.userRole,
      );
    }
    const payment = await this.paymentRepo.findOne({
      where: { id: paymentId, businessId },
      relations: ['business'],
    });
    if (!payment) throw new NotFoundException('Pago no encontrado');
    if (payment.status !== 'escrow_locked') {
      throw new BadRequestException(
        `Solo se puede marcar como enviado un pago en estado escrow_locked. Actual: ${payment.status}`,
      );
    }

    const shippedAt = new Date();
    const autoReleaseAt = new Date(shippedAt.getTime() + 7 * 24 * 60 * 60 * 1000);

    await this.paymentRepo.update(
      { id: paymentId },
      {
        status: 'shipped',
        shippedAt,
        autoReleaseAt,
        trackingNumber: dto.trackingNumber ?? null,
        shipNote: dto.note ?? null,
      },
    );

    const amountSol = Number(BigInt(payment.amountLamports)) / LAMPORTS_PER_SOL;

    await this.webhookDelivery.dispatch(payment.businessId, 'escrow.shipped', {
      paymentId: payment.id,
      orderId: payment.orderId,
      status: 'shipped',
      amount: amountSol,
      autoReleaseAt: autoReleaseAt.toISOString(),
      trackingNumber: dto.trackingNumber,
      timestamp: shippedAt.toISOString(),
    });

    await this.paymentWebhook.dispatch(payment, 'escrow.shipped', {
      paymentId: payment.id,
      orderId: payment.orderId,
      status: 'shipped',
      amount: amountSol,
      autoReleaseAt: autoReleaseAt.toISOString(),
      trackingNumber: dto.trackingNumber,
    });

    return {
      paymentId: payment.id,
      status: 'shipped',
      autoReleaseAt,
    };
  }

  /** Lista pagos de un negocio (para dashboard con JWT) */
  async listPaymentsByBusiness(
    businessId: string,
    userId: string,
    role: string,
    options?: { page?: number; limit?: number },
  ) {
    await this.assertBusinessAccess(businessId, userId, role);
    const page = options?.page ?? 1;
    const limit = Math.min(options?.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const [payments, total] = await this.paymentRepo.findAndCount({
      where: { businessId },
      relations: ['business'],
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    const data = payments.map((p) => {
      const amountSol = Number(BigInt(p.amountLamports)) / LAMPORTS_PER_SOL;
      const commissionSol = p.commissionLamports
        ? Number(BigInt(p.commissionLamports)) / LAMPORTS_PER_SOL
        : 0;
      return {
        id: p.id,
        transactionId: p.transactionId,
        orderId: p.orderId,
        status: p.status,
        amount: amountSol,
        commissionAmount: commissionSol,
        totalAmount: amountSol + commissionSol,
        sellerWallet: p.sellerWallet,
        buyerWallet: p.buyerWallet,
        escrowPda: p.escrowPda,
        qrImageUrl: p.qrImageUrl,
        solanaPayUrl: p.solanaPayUrl,
        paidAt: p.paidAt?.toISOString(),
        shippedAt: p.shippedAt?.toISOString(),
        releasedAt: p.releasedAt?.toISOString(),
        autoReleaseAt: p.autoReleaseAt?.toISOString(),
        expiresAt: p.expiresAt?.toISOString(),
        createdAt: p.createdAt?.toISOString(),
      };
    });

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /** Solo status para polling público del comprador */
  async getPublicStatus(paymentId: string): Promise<{ status: string }> {
    const payment = await this.paymentRepo.findOne({
      where: { id: paymentId },
      select: ['status'],
    });
    if (!payment) throw new NotFoundException('Pago no encontrado');
    return { status: payment.status };
  }
}
