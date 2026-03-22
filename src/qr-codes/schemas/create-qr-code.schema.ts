import { z } from 'zod';

/** El backend genera solana_pay_url y qr_image_url; el cliente solo envía metadatos del QR */
export const createQrCodeSchema = z.object({
  label: z.string().min(1),
  type: z.string().min(1),
  amountLamports: z.string().optional().nullable().transform((v) => v ?? null),
  tokenMint: z.string().optional().nullable().transform((v) => v ?? null),
});

export type CreateQrCodeDto = z.infer<typeof createQrCodeSchema>;
