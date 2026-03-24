import { z } from 'zod';

const SPL_NOT_YET_MSG =
  'Solo se aceptan pagos en SOL nativo por ahora. Los tokens SPL (USDC, etc.) los habilitaremos más adelante.';

export const updateQrCodeSchema = z
  .object({
    label: z.string().min(1).optional(),
    type: z.string().min(1).optional(),
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

export type UpdateQrCodeDto = z.infer<typeof updateQrCodeSchema>;
