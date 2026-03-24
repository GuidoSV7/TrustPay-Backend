import { Entity, PrimaryColumn, Column, UpdateDateColumn } from 'typeorm';

/** Fila única de configuración global de la plataforma (comisión, etc.). */
@Entity('platform_settings')
export class PlatformSettings {
  @PrimaryColumn({ type: 'varchar', length: 36, default: 'default' })
  id: string;

  /** Comisión en basis points (100 = 1%, 10000 = 100%). */
  @Column({ name: 'commission_bps', type: 'int', default: 0 })
  commissionBps: number;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
