import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class AddSubscriptionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  eventType: string;
}
