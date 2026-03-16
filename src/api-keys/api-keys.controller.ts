import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  Patch,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import { ApiKeysService } from './api-keys.service';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { paginationSchema } from '../common/schemas/pagination.schema';
import { createApiKeySchema } from './schemas/create-api-key.schema';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';

@Controller('businesses/:businessId/api-keys')
@UseGuards(JwtAuthGuard)
export class ApiKeysController {
  constructor(private readonly svc: ApiKeysService) {}

  @Post()
  create(
    @Param('businessId') businessId: string,
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(createApiKeySchema)) dto: z.infer<typeof createApiKeySchema>,
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

  @Patch(':id/revoke')
  revoke(
    @Param('businessId') businessId: string,
    @Param('id') id: string,
    @CurrentUser() user: User,
  ) {
    return this.svc.revoke(id, businessId, user.id, user.role);
  }
}
