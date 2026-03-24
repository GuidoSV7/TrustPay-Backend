import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { TransactionsService } from './transactions.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { paginationSchema } from '../common/schemas/pagination.schema';

@Controller()
@UseGuards(JwtAuthGuard)
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  /** Transacciones de un negocio (métricas / historial). */
  @Get('businesses/:businessId/transactions')
  listByBusiness(
    @Param('businessId') businessId: string,
    @CurrentUser() user: User,
    @Query(new ZodValidationPipe(paginationSchema))
    pagination: z.infer<typeof paginationSchema>,
  ) {
    return this.transactionsService.findByBusiness(
      businessId,
      user.id,
      user.role,
      pagination,
    );
  }

  /** Resumen agregado por negocio (totales y por día). */
  @Get('businesses/:businessId/transactions/summary')
  summaryByBusiness(
    @Param('businessId') businessId: string,
    @CurrentUser() user: User,
  ) {
    return this.transactionsService.getSummaryForBusiness(
      businessId,
      user.id,
      user.role,
    );
  }

  /** Todas las transacciones visibles para el usuario (admin: global). */
  @Get('transactions')
  findAll(
    @CurrentUser() user: User,
    @Query(new ZodValidationPipe(paginationSchema))
    pagination: z.infer<typeof paginationSchema>,
  ) {
    return this.transactionsService.findAllForUser(
      user.id,
      user.role,
      pagination,
    );
  }
}
