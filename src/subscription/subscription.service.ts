import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { GRACE_DAYS, PLAN_IDS, PLANS, TRIAL_DAYS } from './config/plans.config';
import { CURRENCY_USD } from './subscription-money.util';
import { nextPeriodEnd } from './subscription-period.util';
import { Subscription } from './entities/subscription.entity';
import { SubscriptionEvent } from './entities/subscription-event.entity';
import type { PaymentReport } from './entities/payment-report.entity';
import { TRIAL_PLAN_ID } from './entitlements.util';
import type { PlansResponse } from './dto/plans-response.dto';

/** Lo que viaja al activarse una suscripción. Lo consume SUB-9. */
export interface SubscriptionActivatedEvent {
  companyId: number;
  subscriptionId: number;
  paymentReportId: number;
  planId: Subscription['planId'];
  previousPeriodEnd: Date | null;
  newPeriodEnd: Date;
}

/** Nombre del evento de activación. */
export const SUBSCRIPTION_ACTIVATED = 'subscription.activated';

/**
 * Suscripciones: catálogo de planes (SUB-1) y avance del período cuando un pago
 * se verifica (SUB-6 / CLYP-337).
 */
@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(
    @InjectRepository(Subscription)
    private readonly subscriptions: Repository<Subscription>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly events: EventEmitter2,
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
   * Arranca la prueba de 15 días del salón (SUB-1).
   *
   * Se llama al registrar el salón. Sin esta fila el tenant cae en la rama de
   * "sin suscripción" de `resolveAccess`, que concede acceso completo SIN fecha
   * de fin: una prueba perpetua. La fila es lo que le pone reloj.
   *
   * Nace en el plan de la prueba (el Full): durante los 15 días usa el producto
   * completo, y la fila dice lo mismo que ve el dueño en su panel. El plan
   * definitivo lo fija el primer pago verificado — pague el que pague.
   *
   * IDEMPOTENTE: si el salón ya tiene suscripción se devuelve la que hay, sin
   * regalar una prueba nueva.
   */
  async startTrial(
    companyId: number,
    now: Date = new Date(),
  ): Promise<Subscription> {
    const existing = await this.subscriptions.findOne({ where: { companyId } });
    if (existing) return existing;

    const trialEndsAt = new Date(
      now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000,
    );

    try {
      const created = await this.subscriptions.save(
        this.subscriptions.create({
          companyId,
          planId: TRIAL_PLAN_ID,
          status: 'trialing',
          trialEndsAt,
          currentPeriodEnd: null,
          graceEndsAt: null,
        }),
      );
      this.logger.log(
        `Prueba iniciada para la company ${companyId}: hasta ${trialEndsAt.toISOString()}`,
      );
      return created;
    } catch (error) {
      // Dos altas simultáneas de la misma company: el único de company_id deja
      // pasar una sola, y la que perdió se queda con la que quedó.
      if (
        error instanceof QueryFailedError &&
        error.message.includes('UQ_subscription_company')
      ) {
        const fresh = await this.subscriptions.findOne({
          where: { companyId },
        });
        if (fresh) return fresh;
      }
      throw error;
    }
  }

  /**
   * Extiende el acceso del tenant por el pago verificado.
   *
   * Es lo ÚNICO que da acceso: ni cotizar ni reportar tocan este estado. El mes
   * se cuenta desde el MAYOR entre hoy y el período vigente (pagar antes no
   * regala ni quita días), la gracia se limpia y el plan pasa a ser el que se
   * pagó.
   *
   * IDEMPOTENTE por reporte: el mismo pago no compra dos meses. La suscripción
   * y su bitácora se guardan en la MISMA transacción, así que o queda el avance
   * con su rastro de auditoría, o no queda nada.
   */
  async advanceSubscription(
    subscription: Subscription,
    report: PaymentReport,
    now: Date = new Date(),
  ): Promise<Subscription> {
    const previousPeriodEnd = subscription.currentPeriodEnd;
    const previousStatus = subscription.status;
    const newPeriodEnd = nextPeriodEnd(now, previousPeriodEnd);

    try {
      const advanced = await this.dataSource.transaction(async (manager) => {
        // Si este pago ya extendió el período, no se vuelve a extender: se
        // devuelve la suscripción tal como quedó la primera vez.
        const already = await manager.findOne(SubscriptionEvent, {
          where: { paymentReportId: report.id },
        });
        if (already) return null;

        subscription.planId = report.planId;
        subscription.status = 'active';
        subscription.currentPeriodEnd = newPeriodEnd;
        subscription.graceEndsAt = null;
        const saved = await manager.save(Subscription, subscription);

        await manager.save(
          manager.create(SubscriptionEvent, {
            companyId: subscription.companyId,
            subscriptionId: subscription.id,
            paymentReportId: report.id,
            type: 'payment_verified',
            planId: report.planId,
            previousStatus,
            newStatus: 'active',
            previousPeriodEnd,
            newPeriodEnd,
          }),
        );

        return saved;
      });

      if (!advanced) return this.reload(subscription);

      this.events.emit(SUBSCRIPTION_ACTIVATED, {
        companyId: advanced.companyId,
        subscriptionId: advanced.id,
        paymentReportId: report.id,
        planId: advanced.planId,
        previousPeriodEnd,
        newPeriodEnd,
      } satisfies SubscriptionActivatedEvent);

      return advanced;
    } catch (error) {
      // Dos verificaciones simultáneas del mismo reporte: la que perdió la
      // carrera choca contra el único y se queda con lo que dejó la otra.
      if (
        error instanceof QueryFailedError &&
        error.message.includes('UQ_subscription_event_report')
      ) {
        this.logger.warn(
          `El reporte ${report.id} ya había extendido la suscripción ${subscription.id}`,
        );
        return this.reload(subscription);
      }
      throw error;
    }
  }

  /** La suscripción como quedó en BD, para no devolver la copia a medio mutar. */
  private async reload(subscription: Subscription): Promise<Subscription> {
    const fresh = await this.subscriptions.findOne({
      where: { id: subscription.id },
    });
    return fresh ?? subscription;
  }
}
