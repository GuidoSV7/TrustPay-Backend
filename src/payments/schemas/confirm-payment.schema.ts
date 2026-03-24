import { z } from 'zod';

export const confirmPaymentSchema = z.object({
  account: z.string().min(32, 'Wallet inválida'),
});

export type ConfirmPaymentDto = z.infer<typeof confirmPaymentSchema>;
