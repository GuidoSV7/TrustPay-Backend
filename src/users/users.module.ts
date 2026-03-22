import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { UsersService } from './users.service';
import { UserProfileController } from './controllers/user-profile.controller';
import { AdminUsersController } from './controllers/admin-users.controller';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [
    UserProfileController, // GET/PATCH/DELETE /users/me (perfil propio)
    AdminUsersController, // CRUD admin bajo /admin/users
  ],
  providers: [UsersService],
  exports: [TypeOrmModule, UsersService],
})
export class UsersModule {}

