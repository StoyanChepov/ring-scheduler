import { IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateDeviceTokenDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  fcmToken: string;
}
