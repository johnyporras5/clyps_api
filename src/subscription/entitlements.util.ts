import {
  GRACE_DAYS,
  getPlan,
  type PlanId,
  type PlanLimits,
} from './config/plans.config';
import type { SubscriptionStatus } from './subscription.enums';

/**
 * Resolución del acceso de un tenant (SUB-5 / CLYP-338).
 *
 * El `status` guardado en `subscription` es una CACHÉ: la escribe el cron de
 * vencimientos y el avance por pago, pero entre una corrida y otra puede estar
 * desactualizada. Aquí se recalcula con las fechas y el pago pendiente, así que
 * el acceso nunca depende de que un job haya corrido a tiempo.
 *
 * Es pura a propósito: la matriz de estados del ticket se prueba sin BD.
 */

/** Por qué está en gracia. Se ven igual desde afuera, pero no son lo mismo. */
export type GraceCause =
  /** Venció y no pagó: 5 días de cortesía antes de bloquear. */
  | 'expired'
  /** Pagó y reportó, pero la verificación manual todavía no ocurre. */
  | 'pending_report'
  | null;

export interface AccessInput {
  /** null = el tenant todavía no tiene suscripción creada. */
  subscription: {
    planId: PlanId;
    status: SubscriptionStatus;
    trialEndsAt: Date | null;
    currentPeriodEnd: Date | null;
    graceEndsAt: Date | null;
    /** No se le cobra: acceso permanente con su plan. */
    billingExempt?: boolean;
  } | null;
  /** Hay un PaymentReport en `reported` esperando verificación. */
  hasPendingReport: boolean;
  graceDays?: number;
  now?: Date;
}

export interface AccessState {
  status: SubscriptionStatus;
  /** false = solo rutas de pago/historial (SUB-12). */
  canOperate: boolean;
  graceCause: GraceCause;
  /** Hasta cuándo llega el acceso pagado (o la prueba). */
  accessEndsAt: Date | null;
  /** Fin de la ventana de gracia, si aplica. */
  graceEndsAt: Date | null;
}

/** El más lejano de los dos vencimientos: prueba o período pagado. */
function accessEndOf(
  trialEndsAt: Date | null,
  currentPeriodEnd: Date | null,
): Date | null {
  if (!trialEndsAt) return currentPeriodEnd;
  if (!currentPeriodEnd) return trialEndsAt;
  return currentPeriodEnd.getTime() >= trialEndsAt.getTime()
    ? currentPeriodEnd
    : trialEndsAt;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * Estado de acceso efectivo del tenant.
 *
 * INVARIANTE del ticket: un pago reportado y sin verificar SIEMPRE concede
 * acceso, aunque la ventana de gracia por fecha ya se haya agotado. No se
 * castiga al tenant por la latencia de NUESTRA verificación.
 */
export function resolveAccess(input: AccessInput): AccessState {
  const now = input.now ?? new Date();
  const graceDays = input.graceDays ?? GRACE_DAYS;
  const subscription = input.subscription;

  // Sin suscripción no se bloquea a nadie: es un tenant que el sistema todavía
  // no dio de alta, no un moroso. Se le trata como en prueba.
  if (!subscription) {
    return {
      status: 'trialing',
      canOperate: true,
      graceCause: null,
      accessEndsAt: null,
      graceEndsAt: null,
    };
  }

  // Exento: no se le cobra, así que no hay vencimiento que evaluar. Va antes
  // que cualquier fecha a propósito — el que no paga porque no le toca no
  // atraviesa gracia ni bloqueo, ni siquiera con el período vencido.
  if (subscription.billingExempt) {
    return {
      status: 'active',
      canOperate: true,
      graceCause: null,
      accessEndsAt: null,
      graceEndsAt: null,
    };
  }

  const accessEndsAt = accessEndOf(
    subscription.trialEndsAt,
    subscription.currentPeriodEnd,
  );

  // Sin fecha de corte no hay nada vencido que evaluar.
  if (!accessEndsAt || accessEndsAt.getTime() > now.getTime()) {
    const onTrial =
      subscription.currentPeriodEnd === null ||
      (subscription.trialEndsAt !== null &&
        accessEndsAt === subscription.trialEndsAt);
    return {
      status: onTrial ? 'trialing' : 'active',
      canOperate: true,
      graceCause: null,
      accessEndsAt,
      graceEndsAt: null,
    };
  }

  // Ya venció. La gracia guardada manda; si no hay, se calcula desde el corte.
  const graceEndsAt =
    subscription.graceEndsAt ?? addDays(accessEndsAt, graceDays);

  if (graceEndsAt.getTime() > now.getTime()) {
    return {
      status: 'grace',
      canOperate: true,
      graceCause: 'expired',
      accessEndsAt,
      graceEndsAt,
    };
  }

  // Gracia agotada. El pago pendiente de verificar sigue dando acceso.
  if (input.hasPendingReport) {
    return {
      status: 'grace',
      canOperate: true,
      graceCause: 'pending_report',
      accessEndsAt,
      graceEndsAt,
    };
  }

  return {
    status: 'blocked',
    canOperate: false,
    graceCause: null,
    accessEndsAt,
    graceEndsAt,
  };
}

/**
 * El plan que el tenant USA durante la prueba: el Full.
 *
 * No se guarda en `subscription.plan_id` a propósito — ahí sigue sin haber plan
 * elegido, que es lo que hace que al vencer la prueba se le cotice el plan que
 * escoja y no el caro por descarte.
 */
export const TRIAL_PLAN_ID: PlanId = 'full';

/**
 * El plan vigente de cara al tenant: en la prueba, el Full; si no, el suyo.
 *
 * Es lo que el panel debe mostrar — durante los 15 días está usando el Full,
 * aunque la columna diga otra cosa porque todavía no eligió.
 */
export function effectivePlanId(
  planId: PlanId,
  status: SubscriptionStatus,
): PlanId {
  return status === 'trialing' ? TRIAL_PLAN_ID : planId;
}

/**
 * Los límites que rigen AHORA: los del plan que está usando.
 *
 * Durante la prueba son los del Full completos —incluido su tope de
 * trabajadores—: la prueba es el Full, no una barra libre. Así lo que el dueño
 * ve en esos 15 días es exactamente lo que va a tener si lo paga, sin sorpresas
 * al vencer.
 */
export function effectiveLimits(
  planId: PlanId,
  status: SubscriptionStatus,
): PlanLimits {
  return getPlan(effectivePlanId(planId, status)).limits;
}
