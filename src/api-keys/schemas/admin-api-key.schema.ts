import { z } from 'zod';
import { paginationSchema } from '../../common/schemas/pagination.schema';

export const adminApiKeysListQuerySchema = paginationSchema.extend({
  search: z.string().max(200).optional(),
});

export const adminApiKeySetDisabledSchema = z.object({
  disabled: z.boolean(),
});

export type AdminApiKeySetDisabledDto = z.infer<
  typeof adminApiKeySetDisabledSchema
>;
