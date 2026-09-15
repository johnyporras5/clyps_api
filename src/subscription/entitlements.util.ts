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
    /** null = todavía no eligió plan: no cambia el acceso, solo el precio. */
    planId: PlanId | null;
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

  // Ya venció.
  //
  // La gracia es SOLO de quien ya pagó alguna vez: se le vence un mes comprado
  // y se le dan unos días para renovar sin quedarse fuera. Al que se le acaba
  // la PRUEBA no se le regalan días extra —serían 15 + 5 gratis—: se bloquea al
  // vencer. Lo delata `currentPeriodEnd`: si es null, nunca hubo pago.
  //
  // Una gracia guardada a mano sigue mandando sobre todo esto: es la forma de
  // darle cortesía a un caso puntual sin tocar la regla.
  const everPaid = subscription.currentPeriodEnd !== null;
  const graceEndsAt =
    subscription.graceEndsAt ??
    (everPaid ? addDays(accessEndsAt, graceDays) : null);

  if (graceEndsAt && graceEndsAt.getTime() > now.getTime()) {
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
 * El plan que se le COBRA cuando hay que ponerle precio a algo: el suyo si ya
 * eligió, y el de la prueba mientras no. Es el mismo que está usando esos 15
 * días, así que cotizarle otro sería cobrarle por algo que no vio.
 *
 * Se usa solo en los caminos de dinero (cotizar, reportar, facturar, recordar).
 * Para pintar la pantalla va `effectivePlanId`.
 */
export function billablePlanId(planId: PlanId | null): PlanId {
  return planId ?? TRIAL_PLAN_ID;
}

/**
 * ¿La prueba sigue corriendo? Se mira la FECHA, no el estado.
 *
 * Al verificarse un pago el estado pasa a `active` aunque queden días de
 * prueba: sin esta función, pagar el día 1 apagaba en el acto el Full que el
 * dueño tenía hasta el día 15.
 */
export function trialStillRunning(
  trialEndsAt: Date | null,
  now: Date = new Date(),
): boolean {
  return trialEndsAt !== null && trialEndsAt.getTime() > now.getTime();
}

/**
 * El plan vigente de cara al tenant: mientras la prueba corra, el Full; si no,
 * el suyo.
 *
 * Es lo que el panel debe mostrar — durante los 15 días está usando el Full,
 * aunque la columna diga otra cosa porque todavía no eligió.
 *
 * La prueba manda AUNQUE YA HAYA PAGADO: los 15 días de Full son suyos por
 * haberse registrado, no por no haber pagado todavía. Quien compra el Básico el
 * día 1 no pierde el Full que le quedaba —igual que no pierde los días
 * (CLYP-337)—: su plan empieza a regir cuando la prueba termina.
 */
export function effectivePlanId(
  planId: PlanId,
  status: SubscriptionStatus,
  trialEndsAt: Date | null = null,
  now: Date = new Date(),
): PlanId {
  if (status === 'trialing' || trialStillRunning(trialEndsAt, now))
    return TRIAL_PLAN_ID;
  return planId;
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
  trialEndsAt: Date | null = null,
  now: Date = new Date(),
): PlanLimits {
  return getPlan(effectivePlanId(planId, status, trialEndsAt, now)).limits;
}
