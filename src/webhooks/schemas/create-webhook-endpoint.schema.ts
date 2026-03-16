import { z } from 'zod';

export const createWebhookEndpointSchema = z.object({
  url: z.string().url().or(z.string().min(1)),
});

export type CreateWebhookEndpointDto = z.infer<typeof createWebhookEndpointSchema>;
