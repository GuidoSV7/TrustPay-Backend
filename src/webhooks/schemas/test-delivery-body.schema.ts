import { z } from 'zod';

export const testDeliveryBodySchema = z.object({
  eventType: z.string().min(1),
  payload: z.record(z.string(), z.unknown()).optional(),
});

export type TestDeliveryBodyDto = z.infer<typeof testDeliveryBodySchema>;
