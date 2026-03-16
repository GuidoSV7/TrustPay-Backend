import { z } from 'zod';

export const createQrCodeSchema = z.object({
  label: z.string().min(1),
  type: z.string().min(1),
  amountLamports: z.string().optional().nullable().transform((v) => v ?? null),
  tokenMint: z.string().optional().nullable().transform((v) => v ?? null),
  solanaPayUrl: z.string().min(1),
  qrImageUrl: z.string().optional().nullable().transform((v) => v ?? null),
});

export type CreateQrCodeDto = z.infer<typeof createQrCodeSchema>;
