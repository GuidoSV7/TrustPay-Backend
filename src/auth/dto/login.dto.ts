import { IsEmail, IsNotEmpty, IsString, IsOptional } from 'class-validator';

export class LoginDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  password: string;

  /** Obligatoria en servidor solo si el usuario no es admin. */
  @IsOptional()
  @IsString()
  walletAddress?: string;
}

