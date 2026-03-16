import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { UsersService } from '../users.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../entities/user.entity';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { paginationSchema } from '../../common/schemas/pagination.schema';
import { updateUserAdminSchema } from '../schemas/update-user-admin.schema';

@Controller('admin/users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminUsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  findAll(
    @Query(new ZodValidationPipe(paginationSchema)) pagination: z.infer<typeof paginationSchema>,
    @Query('search') search?: string,
  ) {
    return this.usersService.findAllComplete(pagination, search);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOneComplete(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body(new ZodValidationPipe(updateUserAdminSchema)) updateData: z.infer<typeof updateUserAdminSchema>) {
    return this.usersService.update(id, updateData);
  }

  @Post(':id/toggle-active')
  toggleActive(@Param('id') id: string) {
    return this.usersService.toggleActive(id);
  }
}
