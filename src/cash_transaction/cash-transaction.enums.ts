/**
 * Tipos de dominio de la caja (CLYP-352).
 *
 * Se guardan como `varchar` en la BD (no enum nativo) siguiendo la convención
 * del proyecto — igual que `payroll_concept.type` / `session_payment.method`.
 * La validación del valor vive en los DTOs (class-validator).
 */

/**
 * Naturaleza del movimiento. Es lo ÚNICO que distingue un gasto de un ingreso:
 * ambos comparten tabla, columnas y reglas. El monto nunca cambia de signo.
 */
export type CashTransactionKind = 'income' | 'expense';
export const CASH_TRANSACTION_KINDS: CashTransactionKind[] = [
  'income',
  'expense',
];

/**
 * Cómo se movió la plata. Mismo vocabulario que `PAYOUT_METHODS` de nómina más
 * `pago_movil`, que en caja sí se registra aparte de la transferencia.
 */
export type CashPaymentMethod =
  | 'efectivo'
  | 'pago_movil'
  | 'transferencia'
  | 'otro';
export const CASH_PAYMENT_METHODS: CashPaymentMethod[] = [
  'efectivo',
  'pago_movil',
  'transferencia',
  'otro',
];
