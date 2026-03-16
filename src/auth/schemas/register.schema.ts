import { z } from 'zod';

export const registerSchema = z.object({
  fullName: z.string().optional().nullable().transform((v) => v ?? null),
  email: z.string().email(),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  country: z.string().optional().nullable().transform((v) => v ?? null),
});

export type RegisterDto = z.infer<typeof registerSchema>;
