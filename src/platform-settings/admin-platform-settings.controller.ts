import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';
import { PlatformSettingsService } from './platform-settings.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import {
  patchCommissionSchema,
  type PatchCommissionDto,
} from './schemas/commission.schema';

@Controller('admin/settings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminPlatformSettingsController {
  constructor(private readonly platformSettings: PlatformSettingsService) {}

  @Get('commission')
  async getCommission() {
    const row = await this.platformSettings.getOrCreate();
    return {
      commissionBps: row.commissionBps,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  @Patch('commission')
  async patchCommission(
    @Body(new ZodValidationPipe(patchCommissionSchema)) body: PatchCommissionDto,
  ) {
    const row = await this.platformSettings.setCommissionBps(body);
    return {
      commissionBps: row.commissionBps,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
