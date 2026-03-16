import { z } from 'zod';

export const updateUserSchema = z.object({
  fullName: z.string().max(255).optional(),
  email: z.string().email().optional(),
  country: z.string().max(100).optional(),
  walletAddress: z.string().max(255).optional(),
});

export type UpdateUserDto = z.infer<typeof updateUserSchema>;
