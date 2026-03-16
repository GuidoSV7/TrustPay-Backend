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

  @Column({ name: 'token_mint', type: 'varchar', length: 255, nullable: true })
  tokenMint: string | null;

  @Column({ name: 'solana_pay_url', type: 'text' })
  solanaPayUrl: string;

  @Column({ name: 'qr_image_url', type: 'text', nullable: true })
  qrImageUrl: string | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
