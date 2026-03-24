import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User, UserRole } from '../users/entities/user.entity';
import { ApiKeysService } from './api-keys.service';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { paginationSchema } from '../common/schemas/pagination.schema';
import { createMerchantApiKeySchema } from './schemas/create-merchant-api-key.schema';

/**
 * Credenciales generales del comercio (mismas API keys para todos los negocios).
 * Solo merchant; por ahora solo devnet.
 */
@Controller('users/me/api-keys')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.MERCHANT)
export class MerchantApiCredentialsController {
  constructor(private readonly svc: ApiKeysService) {}

  @Get()
  findAll(
    @CurrentUser() user: User,
    @Query(new ZodValidationPipe(paginationSchema)) pagination: z.infer<typeof paginationSchema>,
  ) {
    return this.svc.findAllForMerchant(user.id, pagination);
  }

  @Post()
  create(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(createMerchantApiKeySchema))
    dto: z.infer<typeof createMerchantApiKeySchema>,
  ) {
    return this.svc.createForMerchant(user.id, dto);
  }

  @Patch(':id/revoke')
  revoke(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.revokeForMerchant(id, user.id);
  }
}
