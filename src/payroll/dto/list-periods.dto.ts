import { IsArray, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { PERIOD_STATUSES } from '../payroll.enums';
import type { PeriodStatus } from '../payroll.enums';

export class ListPeriodsDto {
  // Filtro del selector de año del histórico.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year?: number;

  // Filtro por estado(s), separados por coma: ?status=review o ?status=paid,closed.
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : value,
  )
  @IsArray()
  @IsIn(PERIOD_STATUSES, { each: true })
  status?: PeriodStatus[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
