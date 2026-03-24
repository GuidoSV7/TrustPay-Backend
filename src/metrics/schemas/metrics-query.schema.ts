import { z } from 'zod';
import { paginationSchema } from '../../common/schemas/pagination.schema';

const sortEnum = z.enum(['count', 'volume']);

const optionalIsoDateTime = z.preprocess(
  (v) => (v === '' || v === undefined ? undefined : v),
  z.string().datetime({ offset: true }).optional(),
);

export const merchantMetricsQuerySchema = z.object({
  from: optionalIsoDateTime,
  to: optionalIsoDateTime,
  sort: sortEnum.optional().default('count'),
});

export type MerchantMetricsQuery = z.infer<typeof merchantMetricsQuerySchema>;

export const adminMerchantsMetricsQuerySchema = paginationSchema.extend({
  from: optionalIsoDateTime,
  to: optionalIsoDateTime,
  sort: sortEnum.optional().default('count'),
});

export type AdminMerchantsMetricsQuery = z.infer<
  typeof adminMerchantsMetricsQuerySchema
>;

/** Serie temporal de pagos escrow (admin): día o semana. */
export const adminPaymentsTimeseriesQuerySchema = z
  .object({
    groupBy: z.enum(['day', 'week']).optional().default('day'),
    buckets: z.coerce.number().int().min(1).max(52).optional(),
  })
  .transform((data) => {
    const groupBy = data.groupBy ?? 'day';
    const buckets = data.buckets ?? (groupBy === 'week' ? 4 : 14);
    return { groupBy, buckets };
  });

export type AdminPaymentsTimeseriesQuery = z.infer<
  typeof adminPaymentsTimeseriesQuerySchema
>;

/** Filtro opcional por un negocio propio (UUID). */
export const escrowLockedQuerySchema = z.object({
  businessId: z.preprocess(
    (v) => (v === '' || v === undefined ? undefined : v),
    z.string().uuid().optional(),
  ),
});

export type EscrowLockedQuery = z.infer<typeof escrowLockedQuerySchema>;
