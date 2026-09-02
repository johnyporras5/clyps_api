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
  planId: PlanId;
  planName: string;
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
  features: Record<PlanFeature, boolean>;
  limits: {
    maxWorkers: number;
    workersInUse: number;
    canAddWorker: boolean;
  };
}
