import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

// Tipos que el admin puede agregar a mano (el resto se autogenera).
export const MANUAL_CONCEPT_TYPES = [
  'bonus',
  'deduction',
  'adjustment',
] as const;
export type ManualConceptType = (typeof MANUAL_CONCEPT_TYPES)[number];

export class CreateManualConceptDto {
  // El tipo define el signo: bonus +, deduction −, adjustment ± (según el monto).
  @IsIn([...MANUAL_CONCEPT_TYPES])
  type: ManualConceptType;

  @IsString()
  @Length(1, 145)
  label: string;

  // Monto en la moneda del concepto. Solo el ajuste admite negativo (restar).
  @Type(() => Number)
  @IsNumber()
  amount: number;

  // Moneda del bono/deducción (VES/USD/EUR). VES por defecto si se omite: así
  // un bono en $ suma al saldo en dólares, no al de Bs.
  @IsOptional()
  @IsIn(['VES', 'USD', 'EUR'])
  currency?: string;

  // Motivo / referencia interna (va en metadata).
  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string;
}
