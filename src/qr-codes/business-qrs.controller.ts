import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { QrCodesService } from './qr-codes.service';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { paginationSchema } from '../common/schemas/pagination.schema';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';

/**
 * Alias de listado: mismo comportamiento que GET /businesses/:businessId/qr-codes
 */
@Controller('businesses/:businessId')
@UseGuards(JwtAuthGuard)
export class BusinessQrsController {
  constructor(private readonly svc: QrCodesService) {}

  @Get('qrs')
  findAllByBusiness(
    @Param('businessId') businessId: string,
    @CurrentUser() user: User,
    @Query(new ZodValidationPipe(paginationSchema)) pagination: z.infer<typeof paginationSchema>,
  ) {
    return this.svc.findAllByBusiness(businessId, user.id, user.role, pagination);
  }
}
