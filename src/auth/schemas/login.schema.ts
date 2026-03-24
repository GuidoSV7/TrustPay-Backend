import { z } from 'zod';
import { isValidSolanaAddress } from '../../common/utils/solana-address.util';

/** Opcional: obligatoria en lógica de negocio solo para usuarios que no son admin. */
const optionalWallet = z
  .string()
  .optional()
  .transform((v) => {
    if (v == null) return undefined;
    const t = String(v).trim();
    return t === '' ? undefined : t;
  })
  .refine((v) => v === undefined || isValidSolanaAddress(v), {
    message: 'walletAddress debe ser una dirección Solana válida (base58)',
  });

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, 'Password is required'),
  walletAddress: optionalWallet,
});

export type LoginDto = z.infer<typeof loginSchema>;
