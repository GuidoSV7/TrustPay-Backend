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
import { Business } from '../../businesses/entities/business.entity';
import { WebhookSubscription } from './webhook-subscription.entity';
import { WebhookDelivery } from './webhook-delivery.entity';

@Entity('webhook_endpoints')
export class WebhookEndpoint {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'business_id', type: 'uuid' })
  businessId: string;

  @ManyToOne(() => Business, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'business_id' })
  business: Business;

  @Column({ type: 'text' })
  url: string;

  @Column({ name: 'secret_hash', type: 'text' })
  secretHash: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany(() => WebhookSubscription, (s) => s.endpoint)
  subscriptions: WebhookSubscription[];

  @OneToMany(() => WebhookDelivery, (d) => d.endpoint)
  deliveries: WebhookDelivery[];
}
