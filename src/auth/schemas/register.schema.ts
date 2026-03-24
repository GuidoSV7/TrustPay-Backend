import { z } from 'zod';
import { isValidSolanaAddress } from '../../common/utils/solana-address.util';

export const registerSchema = z.object({
  fullName: z.string().optional().nullable().transform((v) => v ?? null),
  email: z.string().email(),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  country: z.string().optional().nullable().transform((v) => v ?? null),
  /** Wallet Solana del usuario (obligatoria). */
  walletAddress: z
    .string()
    .refine((s) => s.trim().length > 0, {
      message: 'La wallet Solana es obligatoria',
    })
    .refine((s) => isValidSolanaAddress(s), {
      message: 'walletAddress debe ser una dirección Solana válida (base58)',
    })
    .transform((s) => s.trim()),
});

export type RegisterDto = z.infer<typeof registerSchema>;
