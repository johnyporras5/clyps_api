import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import type { TimelineBucket } from '../utils/clients-report.util';

const BUCKETS: TimelineBucket[] = [
  'day',
  'week',
  'month',
  'quarter',
  'semester',
  'year',
];

/** Rango obligatorio (YYYY-MM-DD) + granularidad para el timeline de ingresos. */
export class CompanyIncomeTimelineQueryDto {
  @IsNotEmpty()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'startDate debe tener formato YYYY-MM-DD',
  })
  startDate: string;

  @IsNotEmpty()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'endDate debe tener formato YYYY-MM-DD',
  })
  endDate: string;

  // Por defecto mensual si no lo mandan.
  @IsOptional()
  @IsIn(BUCKETS, {
    message: `bucket debe ser uno de: ${BUCKETS.join(', ')}`,
  })
  bucket?: TimelineBucket = 'month';
}
