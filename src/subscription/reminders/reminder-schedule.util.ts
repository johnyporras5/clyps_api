import type { ReminderTier } from '../subscription.enums';

/**
 * Qué recordatorio de cobro toca hoy (SUB-8 / CLYP-339).
 *
 * Pura a propósito: el escalado de avisos es lo único difícil de este ticket y
 * se prueba entero sin BD ni cron.
 *
 * La cuenta va en DÍAS DE CALENDARIO, no en horas: el job corre una vez al día
 * a una hora fija, y si se contara por milisegundos un aviso "faltan 7 días"
 * caería o no según el minuto en que arrancó el cron.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Offsets antes del vencimiento que tienen aviso. */
const PRE_TIERS: Record<number, ReminderTier> = {
  7: 'd-7',
  3: 'd-3',
  1: 'd-1',
  0: 'd0',
};

export interface ReminderScheduleInput {
  /** Fin de la prueba, si está en ella. */
  trialEndsAt: Date | null;
  /** Fin del período pagado. */
  currentPeriodEnd: Date | null;
  /** Fin de gracia ya fijado; si no hay, se calcula con `graceDays`. */
  graceEndsAt: Date | null;
  graceDays: number;
  now?: Date;
}

export interface DueReminder {
  tier: ReminderTier;
  /**
   * El vencimiento al que apunta el aviso. Es la llave de idempotencia junto
   * con el tier: al renovarse el período, los mismos tiers vuelven a enviarse.
   */
  periodEnd: Date;
  /** Hasta cuándo puede seguir operando sin pagar. */
  graceEndsAt: Date;
  /** Días que faltan (negativo = ya venció). Para armar el mensaje. */
  daysLeft: number;
}

/** Medianoche de esa fecha, para contar días completos y no horas sueltas. */
function startOfDay(date: Date): number {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ).getTime();
}

/** Días de calendario entre hoy y la fecha objetivo. */
export function daysUntil(target: Date, now: Date): number {
  return Math.round((startOfDay(target) - startOfDay(now)) / DAY_MS);
}

/** El vencimiento vigente: el más lejano entre prueba y período pagado. */
export function periodEndOf(input: ReminderScheduleInput): Date | null {
  const { trialEndsAt, currentPeriodEnd } = input;
  if (!trialEndsAt) return currentPeriodEnd;
  if (!currentPeriodEnd) return trialEndsAt;
  return currentPeriodEnd.getTime() >= trialEndsAt.getTime()
    ? currentPeriodEnd
    : trialEndsAt;
}

/**
 * El aviso que corresponde hoy, o `null` si hoy no toca ninguno.
 *
 * Después del vencimiento hay dos avisos —entró en gracia (`grace`) y se quedó
 * sin ella (`blocked`)— y esta función los devuelve mientras dure cada tramo,
 * no solo el primer día. Quien evita el reenvío es la bitácora
 * (company, tier, periodEnd): así un día que el cron no corra no se traduce en
 * un aviso perdido, pero tampoco en uno repetido.
 */
export function dueReminder(input: ReminderScheduleInput): DueReminder | null {
  const now = input.now ?? new Date();
  const periodEnd = periodEndOf(input);
  if (!periodEnd) return null;

  const graceEndsAt =
    input.graceEndsAt ??
    new Date(periodEnd.getTime() + input.graceDays * DAY_MS);

  const daysLeft = daysUntil(periodEnd, now);

  // Antes de vencer: solo los offsets exactos del ticket. Aquí no se cubren los
  // días salteados a propósito — un "faltan 3 días" enviado con 5 miente.
  if (daysLeft >= 0) {
    const tier = PRE_TIERS[daysLeft];
    return tier ? { tier, periodEnd, graceEndsAt, daysLeft } : null;
  }

  const tier: ReminderTier =
    daysUntil(graceEndsAt, now) > 0 ? 'grace' : 'blocked';
  return { tier, periodEnd, graceEndsAt, daysLeft };
}
