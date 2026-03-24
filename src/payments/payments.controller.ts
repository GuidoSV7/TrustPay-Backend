import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { z } from 'zod';
import { PaymentsService } from './payments.service';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { createPaymentQrSchema } from './schemas/create-payment-qr.schema';
import { shipPaymentSchema } from './schemas/ship-payment.schema';
import { confirmPaymentSchema } from './schemas/confirm-payment.schema';
import { ApiKeyAuthGuard } from '../api-keys/guards/api-key-auth.guard';
import { ApiKeyBusiness } from '../api-keys/decorators/api-key.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { ApiKey } from '../api-keys/entities/api-key.entity';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  /**
   * Crea un pago con QR (escrow). Auth: API Key (x-api-key + x-secret-key).
   */
  @Post('qr')
  @UseGuards(ApiKeyAuthGuard)
  createWithApiKey(
    @ApiKeyBusiness() apiKey: ApiKey,
    @Body(new ZodValidationPipe(createPaymentQrSchema))
    dto: z.infer<typeof createPaymentQrSchema>,
  ) {
    return this.paymentsService.createPaymentQr(apiKey.businessId, dto);
  }

  /**
   * Marcar como enviado. Activa auto-liberación a los 7 días.
   */
  @Post(':paymentId/ship')
  @UseGuards(ApiKeyAuthGuard)
  ship(
    @ApiKeyBusiness() apiKey: ApiKey,
    @Param('paymentId') paymentId: string,
    @Body(new ZodValidationPipe(shipPaymentSchema)) dto: z.infer<typeof shipPaymentSchema>,
  ) {
    return this.paymentsService.shipPayment(paymentId, apiKey.businessId, dto);
  }

  /**
   * Estado mínimo para polling del comprador (sin auth).
   * Ruta más específica primero para que no la capture :paymentId.
   */
  @Get(':paymentId/status')
  @Public()
  getPublicStatus(@Param('paymentId') paymentId: string) {
    return this.paymentsService.getPublicStatus(paymentId);
  }

  /**
   * Consultar estado del pago. Auth: API Key.
   */
  @Get(':paymentId')
  @UseGuards(ApiKeyAuthGuard)
  getStatus(
    @ApiKeyBusiness() apiKey: ApiKey,
    @Param('paymentId') paymentId: string,
  ) {
    return this.paymentsService.getPaymentStatus(paymentId, apiKey.businessId);
  }

  /**
   * Confirmar recepción (liberar escrow). Público.
   * El comprador es cualquier persona con Phantom; no requiere registro.
   * body.account debe coincidir con payment.buyerWallet (la wallet que pagó).
   */
  @Post(':paymentId/confirm')
  @Public()
  confirm(
    @Param('paymentId') paymentId: string,
    @Body(new ZodValidationPipe(confirmPaymentSchema))
    dto: z.infer<typeof confirmPaymentSchema>,
  ) {
    return this.paymentsService.getConfirmTransaction(paymentId, dto.account);
  }
}
