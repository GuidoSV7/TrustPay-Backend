import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

/** Legacy DTO; la API usa Zod (`createQrCodeSchema`). URL e imagen las genera el backend. */
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
}
