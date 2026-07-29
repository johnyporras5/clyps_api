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
  // Monto en la moneda del pago. Por defecto el front manda el saldo completo.
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  amount: number;

  // Moneda del pago (baja el saldo de esa moneda). VES por defecto.
  @IsOptional()
  @IsIn(['VES', 'USD', 'EUR'])
  currency?: string;

  @IsIn([...PAYOUT_METHODS])
  method: PayoutMethod;

  @IsOptional()
  @IsString()
  @MaxLength(145)
  reference?: string;
}
