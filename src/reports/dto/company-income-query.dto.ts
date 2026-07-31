import { IsNotEmpty, IsString, Matches } from 'class-validator';

/** Rango obligatorio (YYYY-MM-DD) para el reporte de ingresos por compañía. */
export class CompanyIncomeQueryDto {
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
}
