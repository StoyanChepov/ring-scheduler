import { IsString, MaxLength, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  @MaxLength(72)
  currentPassword: string;

  // Same rules as at registration.
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  newPassword: string;
}
