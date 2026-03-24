import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { ApiKeysService } from './api-keys.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import {
  adminApiKeysListQuerySchema,
  adminApiKeySetDisabledSchema,
} from './schemas/admin-api-key.schema';

@Controller('admin/api-keys')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminApiKeysController {
  constructor(private readonly svc: ApiKeysService) {}

  /**
   * Todas las API keys (publishable + preview del secret). El sk_* completo no es recuperable (hash).
   */
  @Get()
  findAll(
    @Query(new ZodValidationPipe(adminApiKeysListQuerySchema))
    query: z.infer<typeof adminApiKeysListQuerySchema>,
  ) {
    const { search, ...pagination } = query;
    return this.svc.adminFindAll(pagination, search);
  }

  /**
   * Deshabilitar o reactivar una API key. Si está deshabilitada, no sirve para escrow (headers x-api-key / x-secret-key).
   */
  @Patch(':id')
  setDisabled(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(adminApiKeySetDisabledSchema))
    body: z.infer<typeof adminApiKeySetDisabledSchema>,
  ) {
    return this.svc.adminSetDisabled(id, body);
  }
}
