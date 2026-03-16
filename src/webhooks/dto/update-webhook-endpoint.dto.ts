import { IsBoolean, IsOptional, IsString, IsUrl } from 'class-validator';

export class UpdateWebhookEndpointDto {
  @IsOptional()
  @IsString()
  @IsUrl({ require_tld: false })
  url?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
