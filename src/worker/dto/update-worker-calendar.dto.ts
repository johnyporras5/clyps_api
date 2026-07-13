import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export const WEEK_DAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

export const EXCEPTION_TYPES = ['custom-schedule', 'non-working-day'] as const;

/** Hora en formato 12h: { hour: 1-12, minute, period: 'AM' | 'PM' }. */
export class CalendarTimeDto {
  @IsInt()
  @Min(1)
  @Max(12)
  hour: number;

  @IsInt()
  @Min(0)
  @Max(59)
  minute: number;

  @IsIn(['AM', 'PM'])
  period: 'AM' | 'PM';
}

/** Turno { start, end }. */
export class CalendarPeriodDto {
  @ValidateNested()
  @Type(() => CalendarTimeDto)
  start: CalendarTimeDto;

  @ValidateNested()
  @Type(() => CalendarTimeDto)
  end: CalendarTimeDto;
}

/**
 * Excepción por fecha. `non-working-day` no lleva turnos; `custom-schedule`
 * los lleva directamente (no anidados en `customSchedule`, que es la forma
 * que usa el calendario de la compañía).
 */
export class CalendarExceptionDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'exceptions.date debe tener formato YYYY-MM-DD',
  })
  date: string;

  @IsIn(EXCEPTION_TYPES, {
    message: `exceptions.type debe ser uno de: ${EXCEPTION_TYPES.join(', ')}`,
  })
  type: (typeof EXCEPTION_TYPES)[number];

  @IsOptional()
  @IsString()
  @Length(0, 245)
  reason?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CalendarPeriodDto)
  morning?: CalendarPeriodDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => CalendarPeriodDto)
  afternoon?: CalendarPeriodDto;
}

/**
 * Horario del trabajador.
 */
export class WorkerCalendarDto {
  @IsArray()
  @IsIn(WEEK_DAYS, {
    each: true,
    message: `days solo admite: ${WEEK_DAYS.join(', ')}`,
  })
  days: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => CalendarPeriodDto)
  morning?: CalendarPeriodDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => CalendarPeriodDto)
  afternoon?: CalendarPeriodDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CalendarExceptionDto)
  exceptions?: CalendarExceptionDto[];
}

export class UpdateWorkerCalendarDto {
  @ValidateNested()
  @Type(() => WorkerCalendarDto)
  calendar: WorkerCalendarDto;
}
