/**
 * Tipos de dominio de la nómina (PAY-1).
 *
 * Se guardan como `varchar` en la BD (no enum nativo) siguiendo la convención
 * del proyecto — igual que `session_payment.method` / `service.currency`. La
 * validación del valor vive en los DTOs (class-validator).
 */

/** Ciclo de vida del periodo: open → review → approved → paid → closed. */
export type PeriodStatus = 'open' | 'review' | 'approved' | 'paid' | 'closed';
export const PERIOD_STATUSES: PeriodStatus[] = [
  'open',
  'review',
  'approved',
  'paid',
  'closed',
];

/** Frecuencia de pago del salón. */
export type PayrollFrequency = 'quincenal' | 'semanal' | 'mensual';
export const PAYROLL_FREQUENCIES: PayrollFrequency[] = [
  'quincenal',
  'semanal',
  'mensual',
];

/** Tipo de concepto (línea de nómina). */
export type ConceptType =
  | 'commission'
  | 'tip'
  | 'base'
  | 'bonus'
  | 'deduction'
  | 'adjustment'
  | 'booth_rent';
export const CONCEPT_TYPES: ConceptType[] = [
  'commission',
  'tip',
  'base',
  'bonus',
  'deduction',
  'adjustment',
  'booth_rent',
];

/** Origen de un concepto (para trazabilidad e idempotencia). */
export type ConceptSource =
  | 'appointment'
  | 'tip'
  | 'manual'
  | 'product_sale'
  // Deducción por la compra de un producto por parte del trabajador
  // (source_id = session_product.id de la venta 'worker_purchase').
  | 'product_purchase';

/** Método con el que se registró un pago al empleado. */
export type PayoutMethod = 'efectivo' | 'transferencia' | 'otro';
export const PAYOUT_METHODS: PayoutMethod[] = [
  'efectivo',
  'transferencia',
  'otro',
];
