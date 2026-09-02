/**
 * Aritmética del período de suscripción (SUB-4 / CLYP-336; la usará SUB-6).
 *
 * Los planes se cobran por mes calendario, no por 30 días: quien paga el 31 de
 * enero vence el 28 de febrero, no el 2 de marzo.
 */

/** Un pago verificado compra un mes. */
export const BILLING_PERIOD_MONTHS = 1;

/**
 * Suma meses respetando el fin de mes: 31/01 + 1 mes = 28/02 (o 29 en bisiesto),
 * no 03/03 como haría `setMonth` por su cuenta.
 */
export function addMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDayOfMonth = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(day, lastDayOfMonth));
  return result;
}

/**
 * Hasta cuándo llega el acceso después de verificar un pago.
 *
 * Si el período vigente todavía no vence, el mes nuevo se ENCADENA a partir de
 * esa fecha: pagar antes de tiempo no regala ni quita días. Si ya venció (o
 * nunca hubo), el mes corre desde ahora.
 */
export function nextPeriodEnd(
  now: Date,
  currentPeriodEnd: Date | null,
  months: number = BILLING_PERIOD_MONTHS,
): Date {
  const base =
    currentPeriodEnd && currentPeriodEnd.getTime() > now.getTime()
      ? currentPeriodEnd
      : now;
  return addMonths(base, months);
}
