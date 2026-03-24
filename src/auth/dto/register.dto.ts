import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MinLength,
  IsOptional,
} from 'class-validator';

/** Legacy class-validator; el registro real usa `register.schema.ts` (Zod). */
export class RegisterDto {
  @IsString()
  @IsOptional()
  fullName?: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string;

  @IsString()
  @IsOptional()
  country?: string;

  @IsString()
  @IsNotEmpty()
  walletAddress: string;
}
