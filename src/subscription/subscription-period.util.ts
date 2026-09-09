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

/** El ciclo de facturación que compra un pago: desde cuándo y hasta cuándo. */
export interface PeriodCoverage {
  /** Arranque del ciclo: donde terminaba lo que el tenant ya tenía. */
  from: Date;
  /** Fin del ciclo; es el nuevo `current_period_end` de la suscripción. */
  to: Date;
}

/**
 * El ciclo completo que cubre un pago, no solo su fecha de fin.
 *
 * El mes se ENCADENA a lo que el tenant ya tenía: pagar antes de tiempo no
 * regala ni quita días. Ese "ya tenía" son dos fechas, y manda la más lejana:
 *
 * - `currentPeriodEnd`: el período pagado vigente (renovación).
 * - `trialEndsAt`: los días de prueba que le queden. En el PRIMER pago no hay
 *   período previo, así que sin mirar esta fecha el mes arrancaría hoy y se
 *   comería la prueba: quien paga el día 3 de 15 perdía los 12 restantes.
 *
 * Si ambas ya vencieron (o no existen), el mes corre desde ahora.
 *
 * Devolver el RANGO y no solo su final es lo que permite guardar en el reporte
 * QUÉ ciclo pagó (SUB-6 / CLYP-342). La suscripción sola no puede contarlo:
 * guarda la foto de hoy, no cómo se llegó a ella.
 */
export function periodCoverage(
  now: Date,
  currentPeriodEnd: Date | null,
  trialEndsAt: Date | null = null,
  months: number = BILLING_PERIOD_MONTHS,
): PeriodCoverage {
  const base = [currentPeriodEnd, trialEndsAt].reduce<Date>(
    (latest, candidate) =>
      candidate && candidate.getTime() > latest.getTime() ? candidate : latest,
    now,
  );
  // Copia: el `from` no puede ser la MISMA instancia que el `now` o la fecha de
  // la suscripción que entró, o mutarla desde fuera cambiaría el rango guardado.
  return { from: new Date(base.getTime()), to: addMonths(base, months) };
}

/**
 * Hasta cuándo llega el acceso después de verificar un pago: el fin del ciclo
 * que calcula `periodCoverage`.
 */
export function nextPeriodEnd(
  now: Date,
  currentPeriodEnd: Date | null,
  trialEndsAt: Date | null = null,
  months: number = BILLING_PERIOD_MONTHS,
): Date {
  return periodCoverage(now, currentPeriodEnd, trialEndsAt, months).to;
}
