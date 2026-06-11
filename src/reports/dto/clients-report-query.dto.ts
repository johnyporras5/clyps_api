import { IsIn, IsOptional, IsString, Matches } from 'class-validator';

/**
 * Query del reporte de clientes. Soporta dos modos excluyentes:
 *   1. Por granularidad:  ?granularity=mensual
 *   2. Por rango:         ?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&bucket=mensual
 * El service decide el modo según los parámetros presentes.
 */
export class ClientsReportQueryDto {
  @IsOptional()
  @IsIn(['quincenal', 'mensual', 'trimestral', 'semestral', 'anual'], {
    message:
      'granularity debe ser: quincenal, mensual, trimestral, semestral o anual',
  })
  granularity?: 'quincenal' | 'mensual' | 'trimestral' | 'semestral' | 'anual';

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'startDate debe tener formato YYYY-MM-DD',
  })
  startDate?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'endDate debe tener formato YYYY-MM-DD',
  })
  endDate?: string;

  @IsOptional()
  @IsIn(['semanal', 'quincenal', 'mensual'], {
    message: 'bucket debe ser: semanal, quincenal o mensual',
  })
  bucket?: 'semanal' | 'quincenal' | 'mensual';
}
