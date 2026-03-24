import { z } from 'zod';
import { isValidSolanaAddress } from '@solana-commerce/solana-pay';

export const createPaymentQrSchema = z.object({
  orderId: z.string().optional().nullable().transform((v) => v ?? null),
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
