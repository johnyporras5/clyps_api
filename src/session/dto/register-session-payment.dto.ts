import {
  IsArray,
  ArrayNotEmpty,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Length,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PAYMENT_METHODS } from '../entities/session-payment.entity';

export class SessionPaymentLineDto {
  @IsString()
  @Length(2, 10)
  currency: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  subtotal: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  exchangeRate?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  subtotalBs?: number | null;
}

export class SessionPaymentTipDto {
  @Type(() => Number)
  @IsNumber()
  companyWorkerId: number;

  @IsOptional()
  @IsString()
  workerName?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount: number;
}

export class RegisterSessionPaymentDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => SessionPaymentLineDto)
  lines: SessionPaymentLineDto[];

  @IsOptional()
  @IsString()
  @Length(2, 10)
  tipCurrency?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  tip?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  tipExchangeRate?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  tipBs?: number | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SessionPaymentTipDto)
  tips?: SessionPaymentTipDto[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  totalBs?: number | null;

  @IsOptional()
  @IsIn([...PAYMENT_METHODS])
  method?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  reference?: string | null;

  // "En deuda": se le paga al trabajador (comisiones/propinas normales) pero el
  // cliente aún no pagó a la company. Marca el cobro con collected_at = null.
  @IsOptional()
  @IsBoolean()
  pendingCollection?: boolean;
}
