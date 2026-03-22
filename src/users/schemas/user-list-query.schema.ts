import { z } from 'zod';
import { paginationSchema } from '../../common/schemas/pagination.schema';
import { UserRole } from '../entities/user.entity';

/** Query para listados admin: paginación + búsqueda por nombre/email + filtro por rol */
export const userListQuerySchema = paginationSchema.extend({
  search: z
    .string()
    .optional()
    .transform((v) => (v === undefined || v.trim() === '' ? undefined : v.trim())),
  role: z.nativeEnum(UserRole).optional(),
});

export type UserListQueryInput = z.infer<typeof userListQuerySchema>;
