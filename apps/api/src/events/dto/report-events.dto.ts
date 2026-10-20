import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export const EVENT_TYPES = [
  'STARTED',
  'FINISHED',
  'STOPPED',
  'FAILED',
] as const;
export const EVENT_SOURCES = ['SCHEDULE', 'COMMAND'] as const;

export class AlarmEventDto {
  /** Generated on the phone; re-sending the same event is harmless. */
  @IsUUID()
  id: string;

  @IsIn(EVENT_TYPES)
  type: (typeof EVENT_TYPES)[number];

  @IsIn(EVENT_SOURCES)
  source: (typeof EVENT_SOURCES)[number];

  @IsOptional()
  @IsUUID()
  scheduleId?: string;

  // Command IDs are UUIDs, except the push:test script's "push-test-<ms>".
  @IsOptional()
  @IsString()
  @MaxLength(64)
  commandId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  detail?: string;

  @IsISO8601({ strict: true })
  occurredAt: string;
}

export class ReportEventsDto {
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => AlarmEventDto)
  events: AlarmEventDto[];
}
