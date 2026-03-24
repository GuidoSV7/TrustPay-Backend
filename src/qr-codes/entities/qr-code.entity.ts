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

@Entity('qr_codes')
export class QrCode {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'business_id', type: 'uuid' })
  businessId: string;

  @ManyToOne(() => Business, (b) => b.qrCodes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'business_id' })
  business: Business;

  @Column({ type: 'varchar', length: 255 })
  label: string;

  @Column({ type: 'varchar', length: 50 })
  type: string;

  @Column({ name: 'amount_lamports', type: 'bigint', nullable: true })
  amountLamports: string | null;

  /** Reservado para SPL (futuro). Hoy los QR nuevos van sin mint (solo SOL). */
  @Column({ name: 'token_mint', type: 'varchar', length: 255, nullable: true })
  tokenMint: string | null;

  @Column({ name: 'solana_pay_url', type: 'text' })
  solanaPayUrl: string;

  @Column({ name: 'qr_image_url', type: 'text', nullable: true })
  qrImageUrl: string | null;

  /** Pubkey base58 usada como `reference` en la URL Solana Pay (correlación on-chain). */
  @Column({ name: 'reference_pubkey', type: 'varchar', length: 44, nullable: true })
  referencePubkey: string | null;

  /** Primer pago confirmado (MVP: solo se registra el primero por QR). */
  @Column({ name: 'payment_confirmed_at', type: 'timestamptz', nullable: true })
  paymentConfirmedAt: Date | null;

  @Column({ name: 'payment_signature', type: 'varchar', length: 88, nullable: true })
  paymentSignature: string | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
