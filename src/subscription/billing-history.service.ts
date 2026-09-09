import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentReport } from './entities/payment-report.entity';
import { SubscriptionService } from './subscription.service';
import { EntitlementsService } from './entitlements.service';
import { getPlan } from './config/plans.config';
import { effectivePlanId } from './entitlements.util';
import {
  cycleContextOf,
  toHistoryDetail,
  toHistoryItem,
} from './billing-history.util';
import type { PaginationDto } from '../common/dto/pagination.dto';
import type {
  BillingHistoryDetail,
  BillingHistoryResponse,
  BillingHistorySubscription,
} from './dto/billing-history-response.dto';

/**
 * Historial de facturación del dueño del salón (SUB-13 / CLYP-342).
 *
 * SOLO LECTURA: aquí no se verifica, no se rechaza y no se avanza nada. Es la
 * contraparte de la cola del admin (SUB-4), con dos diferencias que importan:
 * la consulta va SIEMPRE atada al `companyId` del token —el dueño no puede
 * nombrar otro tenant desde ninguna parte— y no se le devuelven los datos
 * internos de la verificación (quién la firmó).
 */
@Injectable()
export class BillingHistoryService {
  constructor(
    @InjectRepository(PaymentReport)
    private readonly reports: Repository<PaymentReport>,
    private readonly subscriptionService: SubscriptionService,
    private readonly entitlements: EntitlementsService,
  ) {}

  /**
   * La página de pagos del tenant, del más reciente al más viejo, con la
   * cabecera de su suscripción.
   *
   * Vienen TODOS los estados: un rechazado también es parte de su historia, y
   * esconderlo dejaría al dueño sin entender por qué no le contó ese pago.
   */
  async list(
    companyId: number,
    query: PaginationDto,
  ): Promise<BillingHistoryResponse> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;

    const subscription =
      await this.subscriptionService.ensureSubscription(companyId);
    const context = cycleContextOf(subscription);

    const [reports, total] = await this.reports.findAndCount({
      where: { companyId },
      // Más reciente primero. El id desempata: dos reportes del mismo segundo
      // no pueden salir en orden distinto entre una página y la siguiente, o se
      // repetiría una fila y se perdería otra.
      order: { reportedAt: 'DESC', id: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      subscription: await this.header(companyId, subscription),
      data: reports.map((report) => toHistoryItem(report, context)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    };
  }

  /**
   * El detalle de UN pago del tenant.
   *
   * El `companyId` va dentro del WHERE, no en una comprobación posterior: el
   * pago de otro salón sencillamente no se encuentra. Y responde 404 —no 403—
   * porque un 403 confirmaría que ese id existe, y con eso se puede contar
   * cuántos pagos tiene la competencia.
   */
  async detail(
    companyId: number,
    reportId: number,
  ): Promise<BillingHistoryDetail> {
    const report = await this.reports.findOne({
      where: { id: reportId, companyId },
    });
    if (!report) throw new NotFoundException('Ese pago no existe.');

    const subscription =
      await this.subscriptionService.ensureSubscription(companyId);
    return toHistoryDetail(report, cycleContextOf(subscription));
  }

  /**
   * La cabecera: en qué plan está y hasta cuándo.
   *
   * El estado sale de `EntitlementsService`, que lo RECALCULA con las fechas.
   * Leer la columna `status` a secas mostraría "activo" a quien venció ayer si
   * el cron todavía no pasó — justo en la pantalla donde va a decidir si paga.
   */
  private async header(
    companyId: number,
    subscription: Awaited<
      ReturnType<SubscriptionService['ensureSubscription']>
    >,
  ): Promise<BillingHistorySubscription> {
    const access = await this.entitlements.getAccessState(companyId);
    const planId = effectivePlanId(
      subscription.planId ?? 'basico',
      access.status,
      subscription.trialEndsAt,
    );

    return {
      planId,
      planName: getPlan(planId).name,
      purchasedPlanId: subscription.planId,
      purchasedPlanName: subscription.planId
        ? getPlan(subscription.planId).name
        : null,
      status: access.status,
      currentPeriodEnd: subscription.currentPeriodEnd
        ? subscription.currentPeriodEnd.toISOString()
        : null,
      trialEndsAt: subscription.trialEndsAt
        ? subscription.trialEndsAt.toISOString()
        : null,
      graceEndsAt: access.graceEndsAt ? access.graceEndsAt.toISOString() : null,
      billingExempt: Boolean(subscription.billingExempt),
    };
  }
}
