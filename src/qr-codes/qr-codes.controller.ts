import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import { QrCodesService } from './qr-codes.service';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { paginationSchema } from '../common/schemas/pagination.schema';
import { createQrCodeSchema } from './schemas/create-qr-code.schema';
import { updateQrCodeSchema } from './schemas/update-qr-code.schema';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';

@Controller('businesses/:businessId/qr-codes')
@UseGuards(JwtAuthGuard)
export class QrCodesController {
  constructor(private readonly svc: QrCodesService) {}

  @Post()
  create(
    @Param('businessId') businessId: string,
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(createQrCodeSchema)) dto: z.infer<typeof createQrCodeSchema>,
  ) {
    return this.svc.create(businessId, user.id, user.role, dto);
  }

  @Get()
  findAll(
    @Param('businessId') businessId: string,
    @CurrentUser() user: User,
    @Query(new ZodValidationPipe(paginationSchema)) pagination: z.infer<typeof paginationSchema>,
  ) {
    return this.svc.findAllByBusiness(businessId, user.id, user.role, pagination);
  }

  @Get(':id')
  findOne(
    @Param('businessId') businessId: string,
    @Param('id') id: string,
    @CurrentUser() user: User,
  ) {
    return this.svc.findOne(id, businessId, user.id, user.role);
  }

  @Patch(':id')
  update(
    @Param('businessId') businessId: string,
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(updateQrCodeSchema)) dto: z.infer<typeof updateQrCodeSchema>,
  ) {
    return this.svc.update(id, businessId, user.id, user.role, dto);
  }

  @Delete(':id')
  remove(
    @Param('businessId') businessId: string,
    @Param('id') id: string,
    @CurrentUser() user: User,
  ) {
    return this.svc.remove(id, businessId, user.id, user.role);
  }
}
