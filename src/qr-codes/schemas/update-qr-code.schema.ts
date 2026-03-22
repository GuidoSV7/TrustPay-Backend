import { z } from 'zod';

export const updateQrCodeSchema = z.object({
  label: z.string().min(1).optional(),
  type: z.string().min(1).optional(),
  amountLamports: z.string().optional().nullable().transform((v) => v ?? null),
  tokenMint: z.string().optional().nullable().transform((v) => v ?? null),
});

export type UpdateQrCodeDto = z.infer<typeof updateQrCodeSchema>;
