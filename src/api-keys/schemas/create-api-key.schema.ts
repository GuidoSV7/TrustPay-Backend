import { z } from 'zod';

const networkEnum = z.enum(['devnet', 'testnet', 'mainnet']);

export const createApiKeySchema = z.object({
  name: z.string().max(255).optional().nullable().transform((v) => v ?? null),
  network: networkEnum.optional().default('devnet'),
});

export type CreateApiKeyDto = z.infer<typeof createApiKeySchema>;
