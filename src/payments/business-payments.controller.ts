import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { PaymentsService } from './payments.service';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { createPaymentQrSchema } from './schemas/create-payment-qr.schema';
import { shipPaymentSchema } from './schemas/ship-payment.schema';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';

/**
 * Pagos escrow creados desde el dashboard (JWT).
 */
@Controller('businesses/:businessId/payments')
@UseGuards(JwtAuthGuard)
export class BusinessPaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  /**
   * Lista pagos escrow del negocio.
   */
  @Get()
  list(
    @Param('businessId') businessId: string,
    @CurrentUser() user: User,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.paymentsService.listPaymentsByBusiness(businessId, user.id, user.role, {
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
  }

  /**
   * Crea un pago con QR (escrow). Requiere JWT del merchant.
   * Usa la wallet del negocio como sellerWallet por defecto si no se especifica.
   */
  @Post('qr')
  create(
    @Param('businessId') businessId: string,
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(createPaymentQrSchema))
    dto: z.infer<typeof createPaymentQrSchema>,
  ) {
    return this.paymentsService.createPaymentQr(businessId, dto, {
      useBusinessWallet: true,
      userId: user.id,
      userRole: user.role,
    });
  }

  @Post(':paymentId/ship')
  ship(
    @Param('businessId') businessId: string,
    @Param('paymentId') paymentId: string,
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(shipPaymentSchema)) dto: z.infer<typeof shipPaymentSchema>,
  ) {
    return this.paymentsService.shipPayment(paymentId, businessId, dto, {
      userId: user.id,
      userRole: user.role,
    });
  }
}
