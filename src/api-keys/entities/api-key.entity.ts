import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Business } from '../../businesses/entities/business.entity';
import { User } from '../../users/entities/user.entity';

@Entity('api_keys')
export class ApiKey {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Clave ligada a un negocio (legacy) o null si es credencial general de cuenta. */
  @Column({ name: 'business_id', type: 'uuid', nullable: true })
  businessId: string | null;

  @ManyToOne(() => Business, (b) => b.apiKeys, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'business_id' })
  business: Business | null;

  /** Credencial general del comercio: aplica a todos sus negocios (mismas pk/sk). */
  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId: string | null;

  @ManyToOne(() => User, (u) => u.apiKeys, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'user_id' })
  user: User | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  name: string | null;

  @Column({ name: 'publishable_key', type: 'varchar', length: 255, unique: true })
  publishableKey: string;

  @Column({ name: 'secret_key', type: 'text' })
  secretKey: string;

  @Column({ name: 'secret_key_preview', type: 'varchar', length: 20, nullable: true })
  secretKeyPreview: string | null;

  @Column({ type: 'varchar', length: 20 })
  network: string;

  @Column({ name: 'last_used_at', type: 'timestamptz', nullable: true })
  lastUsedAt: Date | null;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  /** Deshabilitada por admin: no sirve para API escrow hasta reactivar. */
  @Column({ name: 'disabled_at', type: 'timestamptz', nullable: true })
  disabledAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
