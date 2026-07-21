import { IsIn } from 'class-validator';
import { PERIOD_STATUSES } from '../payroll.enums';
import type { PeriodStatus } from '../payroll.enums';

export class ChangePeriodStatusDto {
  @IsIn(PERIOD_STATUSES)
  status: PeriodStatus;
}
