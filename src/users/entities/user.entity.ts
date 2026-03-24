import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { Exclude } from 'class-transformer';
import { Business } from '../../businesses/entities/business.entity';
import { ApiKey } from '../../api-keys/entities/api-key.entity';

export enum UserRole {
  ADMIN = 'admin',
  MERCHANT = 'merchant',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column({ select: false })
  @Exclude()
  password: string;

  @Column({ name: 'full_name', type: 'varchar', length: 255, nullable: true })
  fullName: string | null;

  @Column({ type: 'varchar', length: 100, default: 'Bolivia' })
  country: string;

  @Column({ name: 'wallet_address', type: 'varchar', length: 255, nullable: true })
  walletAddress: string | null;

  @Column({ name: 'is_verified', default: false })
  isVerified: boolean;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ type: 'varchar', length: 50, default: UserRole.MERCHANT })
  role: UserRole;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany(() => Business, (b) => b.user)
  businesses: Business[];

  @OneToMany(() => ApiKey, (k) => k.user)
  apiKeys: ApiKey[];
}
