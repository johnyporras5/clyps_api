import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  CASH_TRANSACTION_KINDS,
  CASH_PAYMENT_METHODS,
  type CashTransactionKind,
  type CashPaymentMethod,
} from '../cash-transaction.enums';

/**
 * Alta de un movimiento de caja (CLYP-352).
 *
 * `companyId` y `createdBy` NO viajan en el body: salen del token (igual que en
 * el resto de la API). Aquí solo va lo que el usuario captura.
 */
export class CreateCashTransactionDto {
  @IsIn([...CASH_TRANSACTION_KINDS])
  kind: CashTransactionKind;

  @IsString()
  @Length(2, 145)
  concept: string;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  categoryId: number;

  // Céntimos de Bs, SIEMPRE positivo: un gasto se manda con kind='expense', no
  // con monto negativo. Entero, porque la unidad mínima no se fracciona.
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  amountMinor: number;

  // Fecha contable YYYY-MM-DD.
  @IsDateString()
  date: string;

  @IsIn([...CASH_PAYMENT_METHODS])
  paymentMethod: CashPaymentMethod;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  paymentReference?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(145)
  supplierName?: string | null;

  // Solo etiqueta: no dispara nada automático en v1.
  @IsOptional()
  @IsBoolean()
  isRecurring?: boolean;
}
