import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GRACE_DAYS, PLAN_IDS, PLANS, TRIAL_DAYS } from './config/plans.config';
import type { PlanId } from './config/plans.config';
import { CURRENCY_USD } from './subscription-money.util';
import { nextPeriodEnd } from './subscription-period.util';
import { Subscription } from './entities/subscription.entity';
import type { PlansResponse } from './dto/plans-response.dto';

/**
 * Suscripciones: catálogo de planes (SUB-1) y avance del período tras un pago
 * verificado (el núcleo de SUB-6, que SUB-4 ya necesita para activar).
 */
@Injectable()
export class SubscriptionService {
  constructor(
    @InjectRepository(Subscription)
    private readonly subscriptions: Repository<Subscription>,
  ) {}

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

  /**
   * Avanza la suscripción después de un pago verificado.
   *
   * Es lo ÚNICO que da acceso: ni reportar ni cotizar tocan este estado. El mes
   * se encadena al período vigente si aún no vencía (pagar antes no regala ni
   * quita días) y la gracia se limpia — ya no hay nada que perdonar.
   *
   * El plan se toma del reporte: si el dueño pagó el Full, queda en Full.
   */
  async activateAfterPayment(
    subscription: Subscription,
    planId: PlanId,
    now: Date = new Date(),
  ): Promise<Subscription> {
    subscription.planId = planId;
    subscription.status = 'active';
    subscription.currentPeriodEnd = nextPeriodEnd(
      now,
      subscription.currentPeriodEnd,
    );
    subscription.graceEndsAt = null;
    return this.subscriptions.save(subscription);
  }
}
