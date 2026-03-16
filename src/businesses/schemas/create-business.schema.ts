import { z } from 'zod';

export const createBusinessSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional().nullable().transform((v) => v ?? null),
  category: z.string().max(100).optional().nullable().transform((v) => v ?? null),
  logoUrl: z.string().optional().nullable().transform((v) => v ?? null),
  walletAddress: z.string().min(1).max(255),
});

export type CreateBusinessDto = z.infer<typeof createBusinessSchema>;
