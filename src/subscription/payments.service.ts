import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { Company } from '../company/entities/company.entity';
import { FileUploadService } from '../common/services/file_upload.service';
import { Subscription } from './entities/subscription.entity';
import { PaymentReport } from './entities/payment-report.entity';
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
import {
  buildPaymentReportDraft,
  frozenQuoteOf,
  paymentReference,
} from './payment-report.util';
import type { QuoteResponse } from './dto/quote-response.dto';
import type { ReportPaymentDto } from './dto/report-payment.dto';
import type { PaymentReportResponse } from './dto/payment-report-response.dto';

/**
 * Pagos de la suscripción: cotizar (SUB-2 / CLYP-334) y reportar (SUB-3 /
 * CLYP-335).
 *
 * Cotizar NO escribe nada: el monto en Bs se calcula con la tasa del momento y
 * se congela recién al reportar. Reportar tampoco da acceso — crea un reclamo
 * `reported` que alguien (o algo) tiene que verificar en SUB-4/SUB-5.
 */
@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(Subscription)
    private readonly subscriptions: Repository<Subscription>,
    @InjectRepository(PaymentReport)
    private readonly reports: Repository<PaymentReport>,
    @InjectRepository(Company)
    private readonly companies: Repository<Company>,
    private readonly rates: ExchangeRateService,
    private readonly files: FileUploadService,
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
   * cliente al reportar. Una cotización vencida o con los montos editados se
   * rechaza y hay que recotizar.
   */
  async assertFrozenQuoteAcceptable(frozen: FrozenQuote): Promise<void> {
    const fetched = await this.rates.fetchRate();
    const check = validateFrozenQuote(frozen, fetched.rate, this.quoteRules);
    if (!check.ok) throw new BadRequestException(check.message);
  }

  // ---------------------------------------------------------------------------
  // Reporte de pago (SUB-3)
  // ---------------------------------------------------------------------------

  /**
   * Registra el pago que dice haber hecho el dueño.
   *
   * El reporte nace en `reported`: es un RECLAMO, no un cobro. No toca el
   * estado de la suscripción ni da acceso — eso pasa al verificarlo (SUB-4).
   *
   * En Pago Móvil el monto en Bs y su tasa se congelan aquí, previa revalidación
   * contra la tasa del momento: el backend no confía en los números que vuelven
   * del cliente.
   */
  async reportPayment(
    companyId: number,
    dto: ReportPaymentDto,
    proof?: Express.Multer.File,
  ): Promise<PaymentReportResponse> {
    const subscription = await this.subscriptions.findOne({
      where: { companyId },
      select: { id: true, planId: true },
    });
    if (!subscription)
      throw new BadRequestException(
        'No hay una suscripción para esta compañía: no se puede reportar un pago.',
      );

    const reference = paymentReference(dto);
    await this.assertReferenceIsNew(companyId, reference);

    if (dto.method === 'pago_movil') {
      await this.assertFrozenQuoteAcceptable(
        frozenQuoteOf(dto, subscription.planId),
      );
    }

    // La foto se sube DESPUÉS de validar: un reporte rechazado no deja
    // comprobantes huérfanos en el bucket.
    const proofUrl = proof
      ? (
          await this.files.saveFile(
            proof,
            'payment_proof',
            'payment-proof',
            companyId,
          )
        ).fileUrl
      : dto.proofUrl;

    const draft = buildPaymentReportDraft(
      { ...dto, proofUrl },
      {
        companyId,
        subscriptionId: subscription.id,
        planId: subscription.planId,
        reportedAt: new Date(),
      },
    );

    const saved = await this.save(draft);

    return {
      id: saved.id,
      status: saved.status,
      method: saved.method,
      planId: saved.planId,
      amountVesMinor: saved.amountVesMinor,
      amountVesFormatted:
        saved.amountVesMinor === null
          ? null
          : formatVesMinor(saved.amountVesMinor),
      amountUsdMinor: saved.amountUsdMinor,
      currency: saved.currency,
      frozenRate: saved.frozenRate,
      reference: saved.reference,
      proofUrl: saved.proofUrl,
      reportedAt: saved.reportedAt.toISOString(),
      // SUB-8 lee esto mismo para callar los avisos de vencimiento.
      remindersPaused: true,
    };
  }

  /**
   * ¿Hay un reporte esperando verificación? Es la señal de pausa de los
   * recordatorios de cobro (SUB-8): no se guarda una bandera aparte porque se
   * desincronizaría — mientras exista un reclamo `reported`, no se le insiste al
   * dueño que pague algo que ya dice haber pagado.
   */
  async hasPendingReport(companyId: number): Promise<boolean> {
    const pending = await this.reports.countBy({
      companyId,
      status: 'reported',
    });
    return pending > 0;
  }

  /** Un mismo pago no se reporta dos veces. */
  private async assertReferenceIsNew(
    companyId: number,
    reference: string,
  ): Promise<void> {
    const existing = await this.reports.findOne({
      where: { companyId, reference },
      select: { id: true, status: true },
    });
    if (existing)
      throw new ConflictException(
        `Ese pago ya fue reportado (referencia ${reference}).`,
      );
  }

  /**
   * Guarda el reporte traduciendo el choque del índice único a un 409: dos
   * envíos simultáneos del mismo botón pasan la consulta previa, pero no el
   * índice.
   */
  private async save(
    draft: ReturnType<typeof buildPaymentReportDraft>,
  ): Promise<PaymentReport> {
    try {
      return await this.reports.save(this.reports.create(draft));
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        error.message.includes('UQ_payment_report_company_reference')
      ) {
        throw new ConflictException(
          `Ese pago ya fue reportado (referencia ${draft.reference}).`,
        );
      }
      throw error;
    }
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
