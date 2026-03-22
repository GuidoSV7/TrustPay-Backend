import { z } from 'zod';
import { PublicKey } from '@solana/web3.js';

export const createBusinessSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional().nullable().transform((v) => v ?? null),
  category: z.string().max(100).optional().nullable().transform((v) => v ?? null),
  logoUrl: z.string().optional().nullable().transform((v) => v ?? null),
  walletAddress: z
    .string()
    .min(1)
    .max(44)
    .refine(
      (val) => {
        try {
          new PublicKey(val);
          return true;
        } catch {
          return false;
        }
      },
      { message: 'walletAddress debe ser una pubkey Solana válida (base58, 32 bytes)' },
    ),
});

export type CreateBusinessDto = z.infer<typeof createBusinessSchema>;
