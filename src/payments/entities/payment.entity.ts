import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Business } from '../../businesses/entities/business.entity';

export type PaymentStatus =
  | 'pending'
  | 'escrow_locked'
  | 'shipped'
  | 'released'
  | 'auto_released'
  | 'disputed'
  | 'refunded'
  | 'expired';

@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'business_id', type: 'uuid' })
  businessId: string;

  @ManyToOne(() => Business, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'business_id' })
  business: Business;

  /**
   * Id de transacción escrow (32 hex sin guiones = 32 bytes en seeds PDA).
   * Usar `varchar`, no `uuid`: PostgreSQL reformatea uuid con guiones al leer y rompe la PDA.
   */
  @Column({ name: 'transaction_id', type: 'varchar', length: 36, unique: true })
  transactionId: string;

  @Column({ name: 'order_id', type: 'varchar', length: 255, nullable: true })
  orderId: string | null;

  @Column({ name: 'seller_wallet', type: 'varchar', length: 255 })
  sellerWallet: string;

  /** Monto en escrow (lo que recibe el vendedor al liberar). */
  @Column({ name: 'amount_lamports', type: 'bigint' })
  amountLamports: string;

  /** Comisión TrustPay en lamports (transferida aparte al pagar; no entra al escrow). */
  @Column({ name: 'commission_lamports', type: 'bigint', nullable: true })
  commissionLamports: string | null;

  @Column({ name: 'token_mint', type: 'varchar', length: 255, nullable: true })
  tokenMint: string | null;

  @Column({ name: 'webhook_url', type: 'text', nullable: true })
  webhookUrl: string | null;

  /** Secret para firmar webhooks a webhookUrl (opcional; si no hay, no se firma) */
  @Column({ name: 'webhook_secret', type: 'text', nullable: true })
  webhookSecret: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: PaymentStatus;

  @Column({ name: 'escrow_pda', type: 'varchar', length: 255, nullable: true })
  escrowPda: string | null;

  @Column({
    name: 'blockchain_tx_create',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  blockchainTxCreate: string | null;

  @Column({
    name: 'blockchain_tx_release',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  blockchainTxRelease: string | null;

  @Column({
    name: 'blockchain_tx_refund',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  blockchainTxRefund: string | null;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
  paidAt: Date | null;

  @Column({ name: 'released_at', type: 'timestamptz', nullable: true })
  releasedAt: Date | null;

  @Column({ name: 'shipped_at', type: 'timestamptz', nullable: true })
  shippedAt: Date | null;

  @Column({ name: 'auto_release_at', type: 'timestamptz', nullable: true })
  autoReleaseAt: Date | null;

  @Column({ name: 'tracking_number', type: 'varchar', length: 255, nullable: true })
  trackingNumber: string | null;

  @Column({ name: 'ship_note', type: 'text', nullable: true })
  shipNote: string | null;

  /** Wallet del buyer (se conoce cuando Phantom hace POST /tx/:id) */
  @Column({ name: 'buyer_wallet', type: 'varchar', length: 255, nullable: true })
  buyerWallet: string | null;

  @Column({ name: 'solana_pay_url', type: 'text' })
  solanaPayUrl: string;

  @Column({ name: 'qr_image_url', type: 'text', nullable: true })
  qrImageUrl: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
