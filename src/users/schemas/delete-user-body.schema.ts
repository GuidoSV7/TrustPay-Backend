import { z } from 'zod';

export const deleteUserBodySchema = z.object({
  password: z.string().min(1, 'Password is required'),
});

export type DeleteUserBodyDto = z.infer<typeof deleteUserBodySchema>;
