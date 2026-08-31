import type { PlanId, PlanLimits } from '../config/plans.config';

/** Un plan tal como lo consume el frontend. */
export interface PlanResponse {
  id: PlanId;
  name: string;
  /** Precio en centavos de USD; el front decide cómo formatearlo. */
  priceUsdMinor: number;
  /** Moneda de la base de precio. El monto en Bs se cotiza aparte (SUB-2). */
  currency: string;
  limits: PlanLimits;
}

/** Respuesta de GET /subscription/plans. */
export interface PlansResponse {
  plans: PlanResponse[];
  /** Días de prueba al iniciar, sin tarjeta. */
  trialDays: number;
  /** Días de gracia tras vencer el período pagado. */
  graceDays: number;
}
