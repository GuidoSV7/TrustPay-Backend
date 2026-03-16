import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { WebhookEndpoint } from './webhook-endpoint.entity';

@Entity('webhook_subscriptions')
export class WebhookSubscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'endpoint_id', type: 'uuid' })
  endpointId: string;

  @ManyToOne(() => WebhookEndpoint, (e) => e.subscriptions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'endpoint_id' })
  endpoint: WebhookEndpoint;

  @Column({ name: 'event_type', type: 'varchar', length: 100 })
  eventType: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
