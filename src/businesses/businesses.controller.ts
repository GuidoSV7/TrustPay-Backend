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
import { BusinessesService } from './businesses.service';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { paginationSchema } from '../common/schemas/pagination.schema';
import { createBusinessSchema } from './schemas/create-business.schema';
import { updateBusinessSchema } from './schemas/update-business.schema';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User, UserRole } from '../users/entities/user.entity';

@Controller('businesses')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BusinessesController {
  constructor(private readonly svc: BusinessesService) {}

  @Post()
  create(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(createBusinessSchema)) dto: z.infer<typeof createBusinessSchema>,
  ) {
    return this.svc.create(user.id, dto);
  }

  @Get()
  findAll(
    @CurrentUser() user: User,
    @Query(new ZodValidationPipe(paginationSchema)) pagination: z.infer<typeof paginationSchema>,
  ) {
    return this.svc.findAllForUser(user.id, user.role, pagination);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: User) {
    return this.svc.findOne(id, user.id, user.role);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(updateBusinessSchema)) dto: z.infer<typeof updateBusinessSchema>,
  ) {
    return this.svc.update(id, user.id, user.role, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: User) {
    return this.svc.remove(id, user.id, user.role);
  }

  /** Verifica on-chain + BD. Admin (cualquier negocio) o merchant (solo el suyo). */
  @Post(':id/verify')
  @Roles(UserRole.ADMIN, UserRole.MERCHANT)
  verify(@Param('id') id: string, @CurrentUser() user: User) {
    return this.svc.verify(id, user.id, user.role);
  }
}
