import type { PaymentStatus } from '../payments/entities/payment.entity';

/** Pagos que ya entraron en escrow o posterior (volumen / comisión). */
export const PAYMENT_METRICS_STATUSES: PaymentStatus[] = [
  'escrow_locked',
  'shipped',
  'released',
  'auto_released',
  'disputed',
];

/**
 * Fondos aún retenidos en escrow (comprador ya pagó; vendedor aún no recibió en wallet).
 * Excluye released, auto_released, refunded, pending, expired.
 */
export const PAYMENT_ESCROW_LOCKED_STATUSES: PaymentStatus[] = [
  'escrow_locked',
  'shipped',
  'disputed',
];
