import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class RingDeviceDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(300)
  durationSeconds: number = 30;
}