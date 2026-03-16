import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { UserRole } from '../entities/user.entity';
import { UpdateUserDto } from './update-user.dto';

export class UpdateUserAdminDto extends UpdateUserDto {
  @IsOptional()
  @IsBoolean()
  isVerified?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}
