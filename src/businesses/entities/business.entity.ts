import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { QrCode } from '../../qr-codes/entities/qr-code.entity';
import { ApiKey } from '../../api-keys/entities/api-key.entity';
import { WebhookEndpoint } from '../../webhooks/entities/webhook-endpoint.entity';

@Entity('businesses')
export class Business {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, (u) => u.businesses, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  category: string | null;

  @Column({ name: 'logo_url', type: 'text', nullable: true })
  logoUrl: string | null;

  @Column({ name: 'wallet_address', type: 'varchar', length: 255 })
  walletAddress: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany(() => QrCode, (q) => q.business)
  qrCodes: QrCode[];

  @OneToMany(() => ApiKey, (k) => k.business)
  apiKeys: ApiKey[];

  @OneToMany(() => WebhookEndpoint, (w) => w.business)
  webhookEndpoints: WebhookEndpoint[];
}
