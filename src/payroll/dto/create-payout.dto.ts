import {
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PAYOUT_METHODS } from '../payroll.enums';
import type { PayoutMethod } from '../payroll.enums';

export class CreatePayoutDto {
  // Monto en Bs. Por defecto el front manda el saldo completo (editable).
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  amount: number;

  @IsIn([...PAYOUT_METHODS])
  method: PayoutMethod;

  @IsOptional()
  @IsString()
  @MaxLength(145)
  reference?: string;
}
