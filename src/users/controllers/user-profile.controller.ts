import {
  Controller,
  Get,
  Patch,
  Delete,
  Body,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { UsersService } from '../users.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { User } from '../entities/user.entity';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { updateUserSchema } from '../schemas/update-user.schema';
import { deleteUserBodySchema } from '../schemas/delete-user-body.schema';

@Controller('users/me')
@UseGuards(JwtAuthGuard)
export class UserProfileController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  getMyProfile(@CurrentUser() user: User) {
    return this.usersService.getUserProfile(user.id);
  }

  @Patch()
  updateMyProfile(@CurrentUser() user: User, @Body(new ZodValidationPipe(updateUserSchema)) updateData: z.infer<typeof updateUserSchema>) {
    return this.usersService.update(user.id, updateData);
  }

  @Delete()
  deleteMyAccount(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(deleteUserBodySchema)) body: z.infer<typeof deleteUserBodySchema>,
  ) {
    return this.usersService.deactivate(user.id, body.password);
  }
}
