import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Business } from '../../businesses/entities/business.entity';
import { QrCode } from '../../qr-codes/entities/qr-code.entity';

/** Una transacción Solana Pay confirmada on-chain (una fila por firma). */
@Entity('transactions')
@Index(['businessId', 'confirmedAt'])
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'business_id', type: 'uuid' })
  businessId: string;

  @ManyToOne(() => Business, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'business_id' })
  business: Business;

  @Column({ name: 'qr_code_id', type: 'uuid' })
  qrCodeId: string;

  @ManyToOne(() => QrCode, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'qr_code_id' })
  qrCode: QrCode;

  @Column({ type: 'varchar', length: 128, unique: true })
  signature: string;

  @Column({ name: 'reference_pubkey', type: 'varchar', length: 44 })
  referencePubkey: string;

  /** Monto esperado según el QR al momento del cobro (null = monto abierto). */
  @Column({ name: 'amount_lamports', type: 'bigint', nullable: true })
  amountLamports: string | null;

  @Column({ name: 'token_mint', type: 'varchar', length: 255, nullable: true })
  tokenMint: string | null;

  @Column({ name: 'slot', type: 'bigint', nullable: true })
  slot: string | null;

  /** Hora de bloque en cadena (o detección si no hay blockTime). */
  @Column({ name: 'confirmed_at', type: 'timestamptz' })
  confirmedAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
