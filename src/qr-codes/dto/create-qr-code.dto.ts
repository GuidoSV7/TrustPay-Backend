import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateQrCodeDto {
  @IsString()
  @IsNotEmpty()
  label: string;

  @IsString()
  @IsNotEmpty()
  type: string;

  @IsOptional()
  @IsString()
  amountLamports?: string | null;

  @IsOptional()
  @IsString()
  tokenMint?: string | null;

  @IsString()
  @IsNotEmpty()
  solanaPayUrl: string;

  @IsOptional()
  @IsString()
  qrImageUrl?: string | null;
}
