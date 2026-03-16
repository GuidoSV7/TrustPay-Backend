import { z } from 'zod';

const userRoleEnum = z.enum(['admin', 'merchant']);

export const updateUserAdminSchema = z.object({
  fullName: z.string().max(255).optional(),
  email: z.string().email().optional(),
  country: z.string().max(100).optional(),
  walletAddress: z.string().max(255).optional(),
  isVerified: z.boolean().optional(),
  isActive: z.boolean().optional(),
  role: userRoleEnum.optional(),
});

export type UpdateUserAdminDto = z.infer<typeof updateUserAdminSchema>;
