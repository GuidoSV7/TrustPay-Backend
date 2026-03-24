import { z } from 'zod';

export const txPostBodySchema = z.object({
  account: z.string().min(1, 'account (wallet del buyer) es requerido'),
});

export type TxPostBody = z.infer<typeof txPostBodySchema>;
