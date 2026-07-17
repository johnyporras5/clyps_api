import { IsIn } from 'class-validator';
import { PAYROLL_FREQUENCIES } from '../payroll.enums';
import type { PayrollFrequency } from '../payroll.enums';

export class SetFrequencyDto {
  @IsIn(PAYROLL_FREQUENCIES)
  frequency: PayrollFrequency;
}
