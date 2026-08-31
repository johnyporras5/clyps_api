import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from '../company/entities/company.entity';
import { Subscription } from './entities/subscription.entity';
import { ExchangeRateService } from './rate/exchange-rate.service';
import { RATE_DEFAULTS } from './config/rate.config';
import { getPlan, type PlanId } from './config/plans.config';
import { CURRENCY_VES, formatVesMinor } from './subscription-money.util';
import {
  quoteAmountVesMinor,
  quoteValidUntil,
  validateFrozenQuote,
  type FrozenQuote,
  type FrozenQuoteRules,
} from './subscription-quote.util';
import type { QuoteResponse } from './dto/quote-response.dto';

/**
 * Pagos de la suscripción (SUB-2 / CLYP-334): por ahora, cotizar.
 *
 * Cotizar NO escribe nada. El monto en Bs se calcula con la tasa del momento,
 * viaja al cliente y se congela recién al reportar el pago (SUB-3). Reportar y
 * verificar llegan en SUB-3 / SUB-4.
 */
@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(Subscription)
    private readonly subscriptions: Repository<Subscription>,
    @InjectRepository(Company)
    private readonly companies: Repository<Company>,
    private readonly rates: ExchangeRateService,
    private readonly config: ConfigService,
  ) {}

  private num(key: string, fallback: number): number {
    const raw = Number(this.config.get<string>(key));
    return Number.isFinite(raw) && raw > 0 ? raw : fallback;
  }

  /** Reglas de vigencia de una cotización. Configurables por entorno. */
  get quoteRules(): FrozenQuoteRules {
    return {
      ttlHours: this.num(
        'SUBSCRIPTION_QUOTE_TTL_HOURS',
        RATE_DEFAULTS.quoteTtlHours,
      ),
      toleranceBps: this.num(
        'SUBSCRIPTION_QUOTE_RATE_TOLERANCE_BPS',
        RATE_DEFAULTS.rateToleranceBps,
      ),
    };
  }

  /** Company del admin dueño (mismo criterio que el resto del API). */
  async resolveCompanyIdForAdmin(adminUserId: number): Promise<number> {
    const company = await this.companies.findOne({
      where: { userId: adminUserId },
      select: { id: true },
    });
    if (!company)
      throw new UnauthorizedException('No tienes una compañía asignada');
    return company.id;
  }

  /**
   * Monto exacto a pagar en Bs, con la tasa del momento. Sin persistir.
   *
   * Si no se pide un plan explícito se cotiza el de la suscripción vigente: es
   * el caso de la renovación, donde el dueño solo quiere saber cuánto pagar.
   */
  async computeQuote(
    companyId: number,
    requestedPlanId?: PlanId,
  ): Promise<QuoteResponse> {
    const planId = requestedPlanId ?? (await this.currentPlanId(companyId));
    const plan = getPlan(planId);

    const fetched = await this.rates.fetchRate();
    const quotedAt = fetched.fetchedAt;
    const amountVesMinor = quoteAmountVesMinor(plan.id, fetched.rate);

    return {
      planId: plan.id,
      planName: plan.name,
      priceUsdMinor: plan.priceUsdMinor,
      amountVesMinor,
      amountVesFormatted: formatVesMinor(amountVesMinor),
      currency: CURRENCY_VES,
      rate: fetched.rate,
      rateType: fetched.type,
      rateSource: fetched.source,
      rateSourceLabel: fetched.sourceLabel,
      quotedAt: quotedAt.toISOString(),
      validUntil: quoteValidUntil(
        quotedAt,
        this.quoteRules.ttlHours,
      ).toISOString(),
    };
  }

  /**
   * Valida contra la tasa de hoy la cotización congelada que devuelve el
   * cliente al reportar. Lo usa SUB-3 antes de guardar el PaymentReport: una
   * cotización vencida o con los montos editados se rechaza y hay que recotizar.
   */
  async assertFrozenQuoteAcceptable(frozen: FrozenQuote): Promise<void> {
    const fetched = await this.rates.fetchRate();
    const check = validateFrozenQuote(frozen, fetched.rate, this.quoteRules);
    if (!check.ok) throw new BadRequestException(check.message);
  }

  /** Plan de la suscripción vigente de la company. */
  private async currentPlanId(companyId: number): Promise<PlanId> {
    const subscription = await this.subscriptions.findOne({
      where: { companyId },
      select: { planId: true },
    });
    if (!subscription)
      throw new BadRequestException(
        'No hay una suscripción para esta compañía: indica el plan a cotizar.',
      );
    return subscription.planId;
  }
}
