import { IsInt, Max, Min, ValidateIf } from 'class-validator';
import { Transform } from 'class-transformer';
import { VISIT_FREQUENCY_MAX_DAYS } from '../visit-frequency.util';

export class SetVisitFrequencyDto {
  @Transform(({ value }) =>
    value === '' || value === null || value === undefined
      ? null
      : Number(value),
  )
  @ValidateIf((o: SetVisitFrequencyDto) => o.days !== null)
  @IsInt()
  @Min(1)
  @Max(VISIT_FREQUENCY_MAX_DAYS)
  days: number | null;
}
