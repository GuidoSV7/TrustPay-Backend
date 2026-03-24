import { z } from 'zod';

/** Credenciales generales del comercio (solo devnet por ahora). */
export const createMerchantApiKeySchema = z.object({
  name: z.string().max(255).optional().nullable().transform((v) => v ?? null),
});

export type CreateMerchantApiKeyDto = z.infer<typeof createMerchantApiKeySchema>;
