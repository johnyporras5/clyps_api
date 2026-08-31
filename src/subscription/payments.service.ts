import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
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
import {
  DEFAULT_AMOUNT_TOLERANCE_BPS,
  amountDiscrepancy,
} from './payment-discrepancy.util';
import { SubscriptionService } from './subscription.service';
import type { PaginationResult } from '../common/dto/pagination.dto';
import type { QuoteResponse } from './dto/quote-response.dto';
import type { QueryAdminPaymentsDto } from './dto/query-admin-payments.dto';
import type { RejectPaymentDto } from './dto/reject-payment.dto';
import type {
  AdminPaymentDecisionResponse,
  AdminPaymentItem,
} from './dto/admin-payment-response.dto';
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
    private readonly subscriptionService: SubscriptionService,
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

  /**
   * Un mismo pago no se reporta dos veces… salvo que el anterior haya sido
   * RECHAZADO: ahí la referencia se libera.
   *
   * Es el caso del dueño que puso mal el monto: la referencia del banco es la
   * única que tiene, y sin esto se quedaba sin forma de corregir. Lo que sigue
   * bloqueado es repetir una referencia ya verificada (sería cobrar dos veces el
   * mismo pago) o una que todavía está en revisión.
   */
  private async assertReferenceIsNew(
    companyId: number,
    reference: string,
  ): Promise<void> {
    const existing = await this.reports.findOne({
      where: { companyId, reference },
      select: { id: true, status: true },
      // Si hubo varios intentos con la misma referencia, manda el último.
      order: { id: 'DESC' },
    });
    if (!existing || existing.status === 'rejected') return;

    throw new ConflictException(
      existing.status === 'verified'
        ? `Ese pago ya fue verificado (referencia ${reference}).`
        : `Ese pago ya está en revisión (referencia ${reference}).`,
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
        error.message.includes('UQ_payment_report_company_active_reference')
      ) {
        throw new ConflictException(
          `Ese pago ya está reportado (referencia ${draft.reference}).`,
        );
      }
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Cola de verificación del admin de plataforma (SUB-4)
  // ---------------------------------------------------------------------------

  /** Banda de tolerancia del monto reportado. Configurable por entorno. */
  get amountToleranceBps(): number {
    const raw = Number(
      this.config.get<string>('SUBSCRIPTION_AMOUNT_TOLERANCE_BPS'),
    );
    return Number.isFinite(raw) && raw >= 0
      ? raw
      : DEFAULT_AMOUNT_TOLERANCE_BPS;
  }

  /**
   * La cola de verificación: por defecto los `reported`, **más antiguo primero**
   * — es una cola con SLA, no un listado; lo que lleva más esperando se atiende
   * antes.
   */
  async listForAdmin(
    query: QueryAdminPaymentsDto,
  ): Promise<PaginationResult<AdminPaymentItem>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const status = query.status ?? 'reported';

    const builder = this.reports
      .createQueryBuilder('report')
      .where('report.status = :status', { status })
      .orderBy('report.reportedAt', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query.method)
      builder.andWhere('report.method = :method', { method: query.method });

    const [reports, total] = await builder.getManyAndCount();
    // El admin necesita saber DE QUIÉN es el pago, no solo el company_id. Los
    // nombres se traen en UNA consulta para la página completa, no uno por fila.
    const names = await this.companyNames(reports.map((r) => r.companyId));

    return {
      data: reports.map((report) =>
        this.toAdminItem(report, names.get(report.companyId) ?? null),
      ),
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
   * Verificación manual: el admin da por bueno el pago y la suscripción avanza.
   *
   * Una discrepancia de monto NO bloquea: el admin ya la vio marcada en la cola
   * y decidió verificar igual (un pago de menos puede estar acordado). Lo que sí
   * se rechaza es verificar dos veces — un reporte ya resuelto no se re-resuelve.
   */
  async verifyPayment(
    reportId: number,
    verifiedByUserId: number,
  ): Promise<AdminPaymentDecisionResponse> {
    const report = await this.findReportedOrFail(reportId);
    const subscription = await this.subscriptions.findOne({
      where: { companyId: report.companyId },
    });
    if (!subscription)
      throw new BadRequestException(
        'El tenant no tiene suscripción: no hay nada que activar.',
      );

    report.status = 'verified';
    report.verificationMethod = 'manual';
    report.verifiedByUserId = verifiedByUserId;
    report.verifiedAt = new Date();
    report.rejectionReason = null;
    await this.saveDecision(report);

    // SUB-6: verificar es lo único que da acceso. El avance es idempotente por
    // reporte y deja su rastro en `subscription_event`.
    const advanced = await this.subscriptionService.advanceSubscription(
      subscription,
      report,
    );

    return this.toDecision(report, advanced);
  }

  /**
   * Rechazo manual: el pago no aparece o no cuadra.
   *
   * NO toca la suscripción — el tenant sigue como estaba (en gracia, bloqueado o
   * en prueba). El motivo viaja al dueño para que sepa qué corregir (SUB-9).
   */
  async rejectPayment(
    reportId: number,
    dto: RejectPaymentDto,
    verifiedByUserId: number,
  ): Promise<AdminPaymentDecisionResponse> {
    const report = await this.findReportedOrFail(reportId);

    report.status = 'rejected';
    report.verificationMethod = 'manual';
    report.verifiedByUserId = verifiedByUserId;
    report.verifiedAt = new Date();
    report.rejectionReason = dto.rejectionReason;
    await this.saveDecision(report);

    const subscription = await this.subscriptions.findOne({
      where: { companyId: report.companyId },
    });

    return this.toDecision(report, subscription);
  }

  /**
   * Guarda la decisión traduciendo un `verifiedByUserId` inexistente a un 400:
   * el id lo escribe quien llama al endpoint interno, y equivocarse no debería
   * verse como un error del servidor.
   */
  private async saveDecision(report: PaymentReport): Promise<PaymentReport> {
    try {
      return await this.reports.save(report);
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        error.message.includes('FK_payment_report_verified_by')
      ) {
        throw new BadRequestException(
          `El usuario ${report.verifiedByUserId} no existe.`,
        );
      }
      throw error;
    }
  }

  /** Un reporte solo se resuelve una vez, y solo si está por resolver. */
  private async findReportedOrFail(reportId: number): Promise<PaymentReport> {
    const report = await this.reports.findOne({ where: { id: reportId } });
    if (!report) throw new NotFoundException('El reporte de pago no existe.');
    if (report.status !== 'reported')
      throw new ConflictException(
        `Ese pago ya fue ${report.status === 'verified' ? 'verificado' : 'rechazado'}.`,
      );
    return report;
  }

  /** Nombres de los tenants de la página, en una sola consulta. */
  private async companyNames(
    companyIds: number[],
  ): Promise<Map<number, string | null>> {
    if (!companyIds.length) return new Map();
    const companies = await this.companies.find({
      where: companyIds.map((id) => ({ id })),
      select: { id: true, name: true },
    });
    return new Map(companies.map((company) => [company.id, company.name]));
  }

  private toAdminItem(
    report: PaymentReport,
    companyName: string | null,
  ): AdminPaymentItem {
    const discrepancy = amountDiscrepancy(report, this.amountToleranceBps);

    return {
      id: report.id,
      status: report.status,
      method: report.method,
      company: { id: report.companyId, name: companyName },
      planId: report.planId,
      planName: getPlan(report.planId).name,
      amountMinor: discrepancy.reportedMinor,
      currency: report.currency,
      amountVesFormatted:
        report.amountVesMinor === null
          ? null
          : formatVesMinor(report.amountVesMinor),
      frozenRate: report.frozenRate,
      quotedAt: report.quotedAt ? report.quotedAt.toISOString() : null,
      methodData: {
        reference: report.reference,
        payerPhone: report.payerPhone,
        payerBankCode: report.payerBankCode,
        payerEmail: report.payerEmail,
        network: report.network,
      },
      proofUrl: report.proofUrl,
      note: report.note,
      reportedAt: report.reportedAt.toISOString(),
      discrepancy,
      verificationMethod: report.verificationMethod,
      verifiedByUserId: report.verifiedByUserId,
      verifiedAt: report.verifiedAt ? report.verifiedAt.toISOString() : null,
      rejectionReason: report.rejectionReason,
    };
  }

  private toDecision(
    report: PaymentReport,
    subscription: Subscription | null,
  ): AdminPaymentDecisionResponse {
    return {
      id: report.id,
      status: report.status,
      verificationMethod: report.verificationMethod,
      verifiedByUserId: report.verifiedByUserId,
      verifiedAt: report.verifiedAt ? report.verifiedAt.toISOString() : null,
      rejectionReason: report.rejectionReason,
      subscription: {
        companyId: report.companyId,
        planId: subscription?.planId ?? report.planId,
        status: subscription?.status ?? 'blocked',
        currentPeriodEnd: subscription?.currentPeriodEnd
          ? subscription.currentPeriodEnd.toISOString()
          : null,
        graceEndsAt: subscription?.graceEndsAt
          ? subscription.graceEndsAt.toISOString()
          : null,
      },
    };
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
