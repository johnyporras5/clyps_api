import { Injectable } from '@nestjs/common';
import { GRACE_DAYS, PLAN_IDS, PLANS, TRIAL_DAYS } from './config/plans.config';
import { CURRENCY_USD } from './subscription-money.util';
import type { PlansResponse } from './dto/plans-response.dto';

/**
 * Suscripciones (SUB-1 / CLYP-333).
 *
 * De momento solo expone el catálogo de planes. Avanzar la suscripción y
 * calcular el estado de acceso llegan en SUB-2.
 */
@Injectable()
export class SubscriptionService {
  /**
   * Catálogo de planes con sus entitlements. Sale de la config en código, no de
   * la BD: no hay consulta que hacer ni estado por tenant que mezclar aquí.
   *
   * Devuelve también `trialDays` y `graceDays` porque el front los necesita en
   * la misma pantalla ("15 días gratis, sin tarjeta") y no debe hardcodearlos.
   */
  getPlans(): PlansResponse {
    return {
      plans: PLAN_IDS.map((id) => ({
        id,
        name: PLANS[id].name,
        priceUsdMinor: PLANS[id].priceUsdMinor,
        currency: CURRENCY_USD,
        limits: { ...PLANS[id].limits },
      })),
      trialDays: TRIAL_DAYS,
      graceDays: GRACE_DAYS,
    };
  }
}
