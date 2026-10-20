import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class RingDeviceDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(300)
  durationSeconds: number = 30;

  /** One of the user's ringtones; omitted means the phone's alarm sound. */
  @IsOptional()
  @IsUUID()
  ringtoneId?: string;
}
