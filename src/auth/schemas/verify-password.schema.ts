import { z } from 'zod';

export const verifyPasswordSchema = z.object({
  password: z.string().min(1, 'Password is required'),
});

export type VerifyPasswordDto = z.infer<typeof verifyPasswordSchema>;
