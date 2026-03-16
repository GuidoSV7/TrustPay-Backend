import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { UserProfileController } from './controllers/user-profile.controller';
import { AdminUsersController } from './controllers/admin-users.controller';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [
    UserProfileController,  // ✅ REGLA 14 v2.0: Endpoints de usuario autenticado
    AdminUsersController,   // ✅ REGLA 14 v2.0: Endpoints admin
    UsersController,        // @deprecated - Mantener temporalmente para compatibilidad
  ],
  providers: [UsersService],
  exports: [TypeOrmModule, UsersService],
})
export class UsersModule {}

