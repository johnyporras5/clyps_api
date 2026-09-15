import type { PlanId } from '../config/plans.config';
import type { PlanFeature } from '../entitlements.service';
import type { GraceCause } from '../entitlements.util';
import type { SubscriptionStatus } from '../subscription.enums';

/**
 * Respuesta de GET /subscription/access — la foto que el panel del dueño usa
 * para decidir qué pintar (SUB-5).
 *
 * `features` ya combina los dos ejes: una función en `false` puede serlo porque
 * el plan no la incluye o porque el tenant está bloqueado. Para distinguirlo,
 * el front mira `canOperate`: si es `true`, el `false` es plan → CTA de
 * upgrade; si es `false`, la app entera va a la pantalla de pago.
 */
export interface AccessResponse {
  /**
   * El plan que el tenant USA ahora. Mientras la prueba corra es el Full aunque
   * no haya elegido nada —y aunque ya haya pagado otro—: es lo que se le está
   * mostrando esos 15 días. El plan comprado empieza a regir al terminar ella.
   */
  planId: PlanId;
  planName: string;
  /**
   * El plan que COMPRÓ. `null` = todavía no eligió ninguno.
   *
   * Mientras la prueba corre NO coincide con `planId`: quien pagó el Básico el
   * día 1 usa el Full hasta que ella termine. La pantalla necesita los dos para
   * no decirle "tu plan es Full" a quien pagó $15 — el suyo es este.
   */
  purchasedPlanId: PlanId | null;
  purchasedPlanName: string | null;
  /**
   * La prueba sigue corriendo. Sigue en `true` aunque ya haya pagado: pagar no
   * la termina. Es lo que sostiene el distintivo de "te quedan N días", que
   * antes desaparecía en cuanto el pago se verificaba.
   */
  onTrial: boolean;
  /** Cuándo termina la prueba y empieza a regir el plan comprado. */
  trialEndsAt: string | null;
  status: SubscriptionStatus;
  /** false = solo rutas de pago/historial. */
  canOperate: boolean;
  /** Por qué está en gracia: venció, o pagó y falta verificar. */
  graceCause: GraceCause;
  /** Hasta cuándo llega el acceso (prueba o período pagado). */
  accessEndsAt: string | null;
  graceEndsAt: string | null;
  /** Hay un pago esperando verificación: no se le debe insistir que pague. */
  hasPendingReport: boolean;
  /**
   * Exento de cobro: no se le pide pagar nunca. El front le esconde la pantalla
   * de pago y el aviso de vencimiento; su plan se sigue respetando.
   */
  billingExempt: boolean;
  features: Record<PlanFeature, boolean>;
  limits: {
    /** Tope del plan vigente. En la prueba, el del Full. */
    maxWorkers: number;
    workersInUse: number;
    canAddWorker: boolean;
  };
}

/**
 * La foto MÍNIMA del acceso, para quien no es el dueño (SUB-12).
 *
 * Existe porque `GET /subscription/access` es solo del dueño y el trabajador
 * necesitaba saber si el salón está bloqueado sin estrellarse contra un 403 en
 * cada toque. Va sin plan, sin precios, sin fechas y sin límites: el trabajador
 * no tiene por qué ver la facturación del salón donde trabaja.
 */
export interface SubscriptionStatusResponse {
  canOperate: boolean;
  /** A quién le habla el mensaje: define qué pantalla pinta el front. */
  blockedFor: 'adm' | 'wrk' | null;
  /** Qué decirle a ESTE rol. `null` cuando no hay bloqueo. */
  message: string | null;
}
