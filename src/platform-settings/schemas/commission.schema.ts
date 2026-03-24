import { z } from 'zod';

export const patchCommissionSchema = z.object({
  commissionBps: z.coerce
    .number()
    .int()
    .min(0, 'commissionBps mínimo 0')
    .max(10000, 'commissionBps máximo 10000 (100%)'),
});

export type PatchCommissionDto = z.infer<typeof patchCommissionSchema>;
