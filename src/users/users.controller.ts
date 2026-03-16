import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
  Patch,
  Body,
  Delete,
  ForbiddenException,
} from '@nestjs/common';
import { z } from 'zod';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from './entities/user.entity';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from './entities/user.entity';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { paginationSchema } from '../common/schemas/pagination.schema';
import { updateUserAdminSchema } from './schemas/update-user-admin.schema';
import { updateUserSchema } from './schemas/update-user.schema';
import { deleteUserBodySchema } from './schemas/delete-user-body.schema';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  findAll(
    @Query(new ZodValidationPipe(paginationSchema)) pagination: z.infer<typeof paginationSchema>,
    @Query('search') search?: string,
  ) {
    return this.usersService.findAllComplete(pagination, search);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  findOne(@Param('id') id: string, @CurrentUser() currentUser: User) {
    if (currentUser.id !== id && currentUser.role !== UserRole.ADMIN) {
      throw new ForbiddenException('No autorizado');
    }
    return this.usersService.findOneComplete(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateUserAdminSchema)) updateData: z.infer<typeof updateUserAdminSchema>,
    @CurrentUser() currentUser: User,
  ) {
    if (currentUser.id !== id && currentUser.role !== UserRole.ADMIN) {
      throw new ForbiddenException('No autorizado');
    }
    const dto: z.infer<typeof updateUserSchema> | z.infer<typeof updateUserAdminSchema> =
      currentUser.role === UserRole.ADMIN
        ? updateData
        : {
            fullName: updateData.fullName,
            email: updateData.email,
            country: updateData.country,
            walletAddress: updateData.walletAddress,
          };
    return this.usersService.update(id, dto);
  }

  @Post(':id/toggle-active')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  toggleActive(@Param('id') id: string) {
    return this.usersService.toggleActive(id);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  delete(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(deleteUserBodySchema)) body: z.infer<typeof deleteUserBodySchema>,
    @CurrentUser() currentUser: User,
  ) {
    if (currentUser.id !== id) {
      throw new ForbiddenException('No autorizado');
    }
    return this.usersService.deactivate(id, body.password);
  }
}
