import { IsNotEmpty, IsString, IsUrl } from 'class-validator';

export class CreateWebhookEndpointDto {
  @IsString()
  @IsNotEmpty()
  @IsUrl({ require_tld: false })
  url: string;
}
