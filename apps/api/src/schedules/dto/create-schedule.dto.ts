import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsUUID,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export const SCHEDULE_KINDS = ['ONE_TIME', 'WEEKLY'] as const;
export type ScheduleKind = (typeof SCHEDULE_KINDS)[number];

export class CreateScheduleDto {
  @IsIn(SCHEDULE_KINDS)
  kind: ScheduleKind;

  /** ONE_TIME only: the exact moment, with a time zone (e.g. from toISOString()). */
  @ValidateIf((dto: CreateScheduleDto) => dto.kind === 'ONE_TIME')
  @IsISO8601({ strict: true })
  startAt?: string;

  /** WEEKLY only: 24-hour "HH:mm", in the phone's local time. */
  @ValidateIf((dto: CreateScheduleDto) => dto.kind === 'WEEKLY')
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'timeOfDay must be HH:mm (24-hour)',
  })
  timeOfDay?: string;

  /** WEEKLY only: 1 = Monday ... 7 = Sunday. */
  @ValidateIf((dto: CreateScheduleDto) => dto.kind === 'WEEKLY')
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  daysOfWeek?: number[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(300)
  durationSeconds: number = 30;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  label?: string;

  /** One of the user's ringtones; omitted means the phone's alarm sound. */
  @IsOptional()
  @IsUUID()
  ringtoneId?: string;
}

export class UpdateScheduleDto {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(300)
  durationSeconds?: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  label?: string;

  /** null switches back to the phone's alarm sound. */
  @IsOptional()
  @IsUUID()
  ringtoneId?: string | null;
}
