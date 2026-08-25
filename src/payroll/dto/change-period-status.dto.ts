import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import { PERIOD_STATUSES } from '../payroll.enums';
import type { PeriodStatus } from '../payroll.enums';

export class ChangePeriodStatusDto {
  @IsIn(PERIOD_STATUSES)
  status: PeriodStatus;

  // Al cerrar (open→review), si hay citas Completadas SIN cobrar en el período,
  // el backend responde 409 UNCHARGED_APPOINTMENTS. El front avisa y reenvía con
  // esto en true para cerrar de todos modos.
  @IsOptional()
  @IsBoolean()
  confirmUncharged?: boolean;
}
