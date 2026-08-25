import type { CashTransactionKind } from '../cash_transaction/cash-transaction.enums';

/**
 * Tipos de dominio de las categorías de caja (CLYP-353).
 *
 * Se guardan como `varchar` (no enum nativo) siguiendo la convención del
 * proyecto. La validación del valor vive en los DTOs (class-validator).
 */

/**
 * Para qué sirve la categoría. `both` es para las que aplican en las dos
 * direcciones (p. ej. "Otros"), y evita tener que duplicar la misma categoría
 * una vez como gasto y otra como ingreso.
 */
export type CashCategoryKind = 'income' | 'expense' | 'both';
export const CASH_CATEGORY_KINDS: CashCategoryKind[] = [
  'income',
  'expense',
  'both',
];

/**
 * ¿Esta categoría puede usarse en un movimiento de este tipo?
 *
 * Regla: una categoría de gastos no clasifica un ingreso (y viceversa). `both`
 * acepta cualquiera. Lo usa el borrado con reasignación y lo usará el alta de
 * movimientos.
 */
export function categoryAllowsKind(
  categoryKind: CashCategoryKind,
  transactionKind: CashTransactionKind,
): boolean {
  return categoryKind === 'both' || categoryKind === transactionKind;
}
