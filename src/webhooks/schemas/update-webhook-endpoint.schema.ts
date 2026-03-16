import { z } from 'zod';

export const updateWebhookEndpointSchema = z.object({
  url: z.string().url().or(z.string().min(1)).optional(),
  isActive: z.boolean().optional(),
});

export type UpdateWebhookEndpointDto = z.infer<typeof updateWebhookEndpointSchema>;
