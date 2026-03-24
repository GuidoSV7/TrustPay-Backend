import { z } from 'zod';

export const shipPaymentSchema = z.object({
  trackingNumber: z.string().optional().nullable().transform((v) => v ?? null),
  note: z.string().optional().nullable().transform((v) => v ?? null),
});

export type ShipPaymentDto = z.infer<typeof shipPaymentSchema>;
