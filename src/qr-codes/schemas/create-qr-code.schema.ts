import { z } from 'zod';

const SPL_NOT_YET_MSG =
  'Solo se aceptan pagos en SOL nativo por ahora. Los tokens SPL (USDC, etc.) los habilitaremos más adelante.';

/** El backend genera solana_pay_url y qr_image_url; el cliente solo envía metadatos del QR */
export const createQrCodeSchema = z
  .object({
    label: z.string().min(1),
    type: z.string().min(1),
    amountLamports: z.string().optional().nullable().transform((v) => v ?? null),
    /** Reservado para el futuro; hoy debe ir vacío / null (solo SOL). */
    tokenMint: z.string().optional().nullable().transform((v) => v ?? null),
  })
  .superRefine((data, ctx) => {
    if (data.tokenMint != null && String(data.tokenMint).trim() !== '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: SPL_NOT_YET_MSG,
        path: ['tokenMint'],
      });
    }
  });

export type CreateQrCodeDto = z.infer<typeof createQrCodeSchema>;
