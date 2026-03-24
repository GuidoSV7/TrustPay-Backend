import { z } from 'zod';
import { isValidSolanaAddress } from '@solana-commerce/solana-pay';

export const createPaymentQrSchema = z.object({
  /** Obligatorio si usás credenciales generales de cuenta (API key sin negocio fijo). */
  businessId: z.string().uuid().optional().nullable().transform((v) => v ?? null),
  orderId: z.string().optional().nullable().transform((v) => v ?? null),
  /** Monto del pedido (lo que recibe el vendedor vía escrow). El comprador paga este monto + comisión de plataforma (configurable en admin). */
  amount: z.number().positive('El monto debe ser mayor a 0'),
  sellerWallet: z
    .string()
    .optional()
    .transform((v) => (typeof v === 'string' ? v.trim() || null : null))
    .refine((w) => w === null || isValidSolanaAddress(w), {
      message: 'sellerWallet debe ser una dirección Solana válida',
    }),
  webhookUrl: z
    .string()
    .url()
    .optional()
    .nullable()
    .transform((v) => v ?? null),
  webhookSecret: z.string().optional().nullable().transform((v) => v ?? null),
  expiresInMinutes: z.number().int().min(1).max(1440).optional().default(15),
  description: z.string().optional().nullable().transform((v) => v ?? null),
});

export type CreatePaymentQrDto = z.infer<typeof createPaymentQrSchema>;
