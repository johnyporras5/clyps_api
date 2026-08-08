import {
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

// Tipos que el admin puede agregar a mano (el resto se autogenera).
// 'tip' = propina manual (suma a propinas del trabajador, no a bonos).
export const MANUAL_CONCEPT_TYPES = [
  'bonus',
  'deduction',
  'adjustment',
  'tip',
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

  // Tasa del día (Bs por 1 unidad de la moneda del negocio) al registrar el
  // concepto. El front la manda cuando el concepto va en Bs pero los servicios
  // son en $/€, para poder convertirlo en el reporte del trabajador. Opcional.
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  exchangeRate?: number;

  // Motivo / referencia interna (va en metadata).
  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string;
}
