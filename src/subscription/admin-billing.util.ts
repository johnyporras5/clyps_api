import { TRIAL_DAYS } from './config/plans.config';

/**
 * Reglas del panel de plataforma para el cobro de un salón: hacerlo VIP,
 * quitárselo y darle más días de prueba.
 *
 * Son puras a propósito: las decisiones se prueban sin BD y el servicio solo
 * las aplica dentro de su transacción.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Días que se regalan al alargar una prueba o al quitar el VIP. */
export const EXTRA_TRIAL_DAYS = TRIAL_DAYS;

/** Lo que estas reglas leen de la suscripción. */
export interface BillingSnapshot {
  billingExempt: boolean;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
}

/** Hoy + 15 días. Se cuenta desde HOY, no desde que venció. */
export function extraTrialEnd(now: Date = new Date()): Date {
  return new Date(now.getTime() + EXTRA_TRIAL_DAYS * DAY_MS);
}

/**
 * El nuevo fin de prueba al darle +15 días.
 *
 * Se le puede dar a CUALQUIER salón —bloqueado, VIP, que ya pagó o que sigue
 * en prueba—: lo decide el administrador, no esta regla.
 *
 * Se suma a lo MÁS LEJANO entre hoy y su fin de prueba actual, para no quitarle
 * nunca días:
 *   - prueba vencida (o sin prueba)  -> hoy + 15
 *   - prueba con 10 días por delante -> esos 10 + 15 = 25 desde hoy
 *
 * Ojo: por eso cada clic suma otros 15. No es idempotente a propósito; el
 * doble clic lo frena el panel (botón deshabilitado mientras guarda).
 */
export function extendedTrialEnd(
  trialEndsAt: Date | null,
  now: Date = new Date(),
): Date {
  const base =
    trialEndsAt && trialEndsAt.getTime() > now.getTime() ? trialEndsAt : now;
  return extraTrialEnd(base);
}

/**
 * La nueva fecha de fin de prueba al QUITAR el VIP, o `null` si no hace falta
 * tocarla.
 *
 * Al volver a cobrarle se le dan 15 días desde hoy para que pague sin quedar
 * bloqueado en el acto (su fecha de pago pudo pasar hace meses mientras era
 * VIP). Si lo que ya tiene —un mes pagado o una prueba— llega más lejos que
 * esos 15 días, se le respeta y no se toca nada.
 */
export function trialAfterVipRevoked(
  subscription: BillingSnapshot,
  now: Date = new Date(),
): Date | null {
  const end = extraTrialEnd(now);
  const covered = [
    subscription.currentPeriodEnd,
    subscription.trialEndsAt,
  ].some((date) => date !== null && date.getTime() >= end.getTime());
  return covered ? null : end;
}
