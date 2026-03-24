import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { MetricsService } from './metrics.service';
import {
  adminMerchantsMetricsQuerySchema,
  adminPaymentsTimeseriesQuerySchema,
} from './schemas/metrics-query.schema';

@Controller('admin/metrics')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminMetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  /**
   * Merchants ordenados por volumen o cantidad de pagos escrow; comisión estimada.
   */
  @Get('merchants/payments')
  async merchantsPayments(
    @Query(new ZodValidationPipe(adminMerchantsMetricsQuerySchema))
    query: z.infer<typeof adminMerchantsMetricsQuerySchema>,
  ) {
    return this.metricsService.getAdminMerchantsPaymentMetrics(query);
  }

  /** Serie temporal de pagos escrow (día o semana). */
  @Get('payments/timeseries')
  async paymentsTimeseries(
    @Query(new ZodValidationPipe(adminPaymentsTimeseriesQuerySchema))
    query: z.infer<typeof adminPaymentsTimeseriesQuerySchema>,
  ) {
    return this.metricsService.getAdminPaymentsTimeseries(query);
  }

  /** Distribución de merchants por volumen (terciles + sin pagos). */
  @Get('merchants/distribution')
  async merchantsDistribution() {
    return this.metricsService.getAdminMerchantsVolumeDistribution();
  }
}
