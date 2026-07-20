import { IsIn, IsOptional, Matches } from 'class-validator';
import { PAYROLL_FREQUENCIES } from '../payroll.enums';
import type { PayrollFrequency } from '../payroll.enums';

export class SetFrequencyDto {
  @IsIn(PAYROLL_FREQUENCIES)
  frequency: PayrollFrequency;

  // Solo en el primer arranque: día desde el que empieza a contar la nómina.
  // Formato YYYY-MM-DD. Si se omite, arranca hoy.
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'startDate debe tener el formato YYYY-MM-DD',
  })
  startDate?: string;
}
