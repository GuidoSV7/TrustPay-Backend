import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateBusinessDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  walletAddress: string;
}
