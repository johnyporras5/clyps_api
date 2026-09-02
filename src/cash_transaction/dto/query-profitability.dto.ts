import { IsDateString } from 'class-validator';

/** Rango del reporte de rentabilidad (CLYP-357). Ambas fechas obligatorias. */
export class QueryProfitabilityDto {
  /** Desde, inclusive (YYYY-MM-DD). */
  @IsDateString()
  from: string;

  /** Hasta, inclusive (YYYY-MM-DD). */
  @IsDateString()
  to: string;
}
