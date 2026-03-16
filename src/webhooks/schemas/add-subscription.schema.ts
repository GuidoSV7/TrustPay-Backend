import { z } from 'zod';

export const addSubscriptionSchema = z.object({
  eventType: z.string().min(1).max(100),
});

export type AddSubscriptionDto = z.infer<typeof addSubscriptionSchema>;
