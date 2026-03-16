import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateApiKeyDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @IsIn(['devnet', 'testnet', 'mainnet'])
  network?: string;
}
