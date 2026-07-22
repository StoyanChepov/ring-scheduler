import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateDeviceDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name: string;

  @IsOptional()
  @IsIn(['ANDROID', 'WEB', 'MOCK'])
  platform?: string = 'MOCK';

  @IsOptional()
  @IsString()
  fcmToken?: string;
}