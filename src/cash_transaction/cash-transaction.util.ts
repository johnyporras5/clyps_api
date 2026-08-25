import type { CashTransactionKind } from './cash-transaction.enums';

/**
 * Primitivas de signo de la caja (CLYP-352).
 *
 * INVARIANTE: `amount_minor` se almacena SIEMPRE positivo. El signo no es un
 * dato, se DERIVA de `kind`. Nadie debe escribir un monto negativo en la BD ni
 * restar a mano: para sumar caja se usa `signedAmountMinor`.
 *
 * El dinero sigue la convención de nómina: enteros en la unidad mínima
 * (céntimos de Bs). Ver `payroll-money.util.ts` para toMinor/fromMinor.
 */

/** +1 ingreso / −1 gasto. */
export function signOf(kind: CashTransactionKind): 1 | -1 {
  return kind === 'expense' ? -1 : 1;
}

/**
 * Monto con signo para agregaciones (balance de caja). El único lugar donde un
 * gasto se vuelve negativo es aquí, en memoria — nunca en la fila.
 */
export function signedAmountMinor(tx: {
  kind: CashTransactionKind;
  amountMinor: number;
}): number {
  return signOf(tx.kind) * (tx.amountMinor || 0);
}

/**
 * Regla del ticket: `amountMinor` > 0 y entero. Los DTOs ya la validan en el
 * borde HTTP; esto protege a quien cree movimientos desde código (importadores,
 * jobs, otros módulos) sin pasar por un DTO.
 */
export function assertPositiveAmountMinor(amountMinor: number): void {
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
    throw new Error(
      `amountMinor debe ser un entero positivo (recibido: ${amountMinor}). ` +
        'El signo lo da `kind`, no el monto.',
    );
  }
}
