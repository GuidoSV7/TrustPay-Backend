import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { MetricsService } from './metrics.service';
import {
  merchantMetricsQuerySchema,
  escrowLockedQuerySchema,
  adminPaymentsTimeseriesQuerySchema,
} from './schemas/metrics-query.schema';

@Controller('metrics')
@UseGuards(JwtAuthGuard)
export class MerchantMetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  /**
   * SOL aún en escrow (pagado por el comprador, no liberado al vendedor).
   * Query opcional: `businessId` (UUID de un negocio tuyo).
   */
  @Get('my-businesses/escrow-locked')
  async myEscrowLocked(
    @CurrentUser() user: User,
    @Query(new ZodValidationPipe(escrowLockedQuerySchema))
    query: z.infer<typeof escrowLockedQuerySchema>,
  ) {
    return this.metricsService.getMyEscrowLockedSummary(
      user.id,
      query.businessId,
    );
  }

  /**
   * Ranking de negocios del merchant por pagos escrow (QR Solana Pay).
   */
  @Get('my-businesses/payments')
  async myBusinessesPayments(
    @CurrentUser() user: User,
    @Query(new ZodValidationPipe(merchantMetricsQuerySchema))
    query: z.infer<typeof merchantMetricsQuerySchema>,
  ) {
    return this.metricsService.getMyBusinessesPaymentMetrics(user.id, query);
  }

  /** Embudo por estado de pago (órdenes activas, sin refunded/expired). */
  @Get('my-businesses/payment-funnel')
  async myPaymentFunnel(@CurrentUser() user: User) {
    return this.metricsService.getMerchantPaymentFunnel(user.id);
  }

  /**
   * Serie temporal de pagos (solo negocios del merchant autenticado).
   */
  @Get('my-payments/timeseries')
  async myPaymentsTimeseries(
    @CurrentUser() user: User,
    @Query(new ZodValidationPipe(adminPaymentsTimeseriesQuerySchema))
    query: z.infer<typeof adminPaymentsTimeseriesQuerySchema>,
  ) {
    return this.metricsService.getMerchantPaymentsTimeseries(user.id, query);
  }
}
