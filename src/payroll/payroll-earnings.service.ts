import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { PeriodDetail } from './entities/period-detail.entity';
import { PayrollConcept } from './entities/payroll-concept.entity';
import { PayrollPeriod } from './entities/payroll-period.entity';
import { Payout } from './entities/payout.entity';
import { Company } from '../company/entities/company.entity';
import { PayrollPeriodService } from './payroll-period.service';
import type { PeriodStatus, ConceptSource } from './payroll.enums';
import { FileUploadService } from '../common/services/file_upload.service';
import { toMinor, fromMinor } from './payroll-money.util';
import { CreateManualConceptDto } from './dto/create-manual-concept.dto';
import { CreateProductPurchaseDto } from './dto/create-product-purchase.dto';
import { CreatePayoutDto } from './dto/create-payout.dto';
import { Product } from '../product/entities/product.entity';
import { SessionProduct } from '../product/entities/session_product.entity';
import { ProductStockMovement } from '../product/entities/product_stock_movement.entity';

const isDupEntry = (e: unknown): boolean =>
  (e as { code?: string; driverError?: { code?: string } })?.code ===
    'ER_DUP_ENTRY' ||
  (e as { driverError?: { code?: string } })?.driverError?.code ===
    'ER_DUP_ENTRY';

// Datos de una comisión a registrar (los arma el lado de sesión al pagar).
export interface CommissionItem {
  sessionDetailId: number; // → source_id (trazabilidad + idempotencia)
  companyWorkerId: number;
  workerAmount: number; // comisión del worker, en la moneda del servicio
  serviceCost: number; // precio del servicio, en su moneda
  currency: string; // 'USD' | 'EUR' | 'VES'
  exchangeRate: number | null; // Bs por 1 unidad (null si falta; VES = 1)
  label: string;
  appointmentId?: number;
}

// Datos de una propina a registrar (una fila de session_payment_tips).
export interface TipItem {
  tipId: number; // → source_id (idempotencia)
  companyWorkerId: number;
  amount: number; // propina del worker, en tipCurrency
  currency: string; // moneda de la propina
  exchangeRate: number | null; // Bs por 1 unidad (VES = 1)
  appointmentId?: number;
  serviceName?: string | null;
}

// Concepto que sale de una atribución del payload de cobro (CLYP-318). El monto
// ya viene calculado en unidades mínimas de la moneda del ítem; el lado de
// sesión lo resuelve (porcentaje sobre el precio del ítem, o monto fijo).
export interface AttributionConceptItem {
  kind: 'commission' | 'tip';
  companyWorkerId: number; // employeeId de la atribución
  amountItemMinor: number; // monto en minor de `currency`
  currency: string; // moneda del ítem de origen
  exchangeRate: number | null; // Bs por 1 unidad (VES = 1)
  sourceType: ConceptSource; // 'appointment' (servicio) | 'product_sale'
  sourceId: number; // session_detail.id | session_product.id
  label: string;
  rateBps?: number; // solo si vino por porcentaje (para metadata)
  appointmentId?: number;
  roleLabel?: string; // comisión por rol: etiqueta a mostrar en nómina
}

// CLYP-362: deducción por descuento absorbido por un trabajador. El monto ya
// viene topado (nunca deja la comisión del trabajador negativa).
export interface DiscountConceptItem {
  companyWorkerId: number;
  amountItemMinor: number; // monto POSITIVO del descuento en `currency`
  currency: string;
  exchangeRate: number | null; // Bs por 1 unidad (VES = 1)
  sourceType: ConceptSource; // 'appointment' (source_id = session_detail.id)
  sourceId: number;
  label: string;
  reason?: string | null;
  appointmentId?: number;
}

@Injectable()
export class PayrollEarningsService {
  private readonly logger = new Logger(PayrollEarningsService.name);

  constructor(
    @InjectRepository(PeriodDetail)
    private readonly detailRepo: Repository<PeriodDetail>,
    @InjectRepository(PayrollConcept)
    private readonly conceptRepo: Repository<PayrollConcept>,
    @InjectRepository(PayrollPeriod)
    private readonly periodRepo: Repository<PayrollPeriod>,
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
    @InjectRepository(Payout)
    private readonly payoutRepo: Repository<Payout>,
    private readonly periodService: PayrollPeriodService,
    private readonly fileUploadService: FileUploadService,
  ) {}

  /** URL de la foto del trabajador, igual que la arma el roster. */
  private workerPictureUrl(picture?: string | null): string | null {
    return picture
      ? this.fileUploadService.getFileUrl('worker_photo', picture)
      : null;
  }

  /**
   * ¿Debe omitirse el cobro para nómina? Sí cuando la empresa NO activó la
   * nómina (no hay ningún periodo → no se crea uno solo) o cuando el cobro es
   * ANTERIOR al día en que arrancó (la nómina empieza en limpio desde la fecha
   * que el admin eligió).
   */
  private async isBeforeActivation(
    companyId: number,
    whenPaid: Date,
  ): Promise<boolean> {
    const activation =
      await this.periodService.resolveActivationDate(companyId);
    if (!activation) {
      this.logger.log(
        `Nómina no activada para company ${companyId}; el cobro no genera conceptos`,
      );
      return true;
    }
    if (whenPaid.getTime() < activation.getTime()) {
      this.logger.log(
        `Cobro (${whenPaid.toISOString()}) anterior a la activación de nómina ` +
          `(${activation.toISOString()}); se omite (company ${companyId})`,
      );
      return true;
    }
    return false;
  }

  /** Fila del empleado en el periodo (get-or-create, seguro ante carreras). */
  async ensurePeriodDetail(
    companyId: number,
    periodId: number,
    companyWorkerId: number,
  ): Promise<PeriodDetail> {
    const existing = await this.detailRepo.findOne({
      where: { periodId, companyWorkerId },
    });
    if (existing) return existing;
    try {
      return await this.detailRepo.save(
        this.detailRepo.create({ companyId, periodId, companyWorkerId }),
      );
    } catch (e) {
      if (isDupEntry(e)) {
        const d = await this.detailRepo.findOne({
          where: { periodId, companyWorkerId },
        });
        if (d) return d;
      }
      throw e;
    }
  }

  /**
   * Genera los conceptos de comisión de un pago. Idempotente por servicio: si un
   * concepto ya existe (mismo detail), se omite. Devuelve cuántos creó.
   */
  async recordCommissions(
    companyId: number,
    whenPaid: Date,
    items: CommissionItem[],
    method?: string | null,
  ): Promise<number> {
    if (items.length === 0) return 0;
    if (await this.isBeforeActivation(companyId, whenPaid)) return 0;

    const period = await this.periodService.ensureOpenPeriod(
      companyId,
      whenPaid,
    );
    // Efectivo: la comisión queda en la moneda del servicio (USD/EUR). Otros
    // métodos → Bs, como siempre.
    const isCash = method === 'cash' || method === 'efectivo';
    let created = 0;

    for (const it of items) {
      const rate = it.exchangeRate ?? (it.currency === 'VES' ? 1 : null);
      if (rate == null || !(it.workerAmount > 0)) continue; // sin tasa/comisión → nada
      const keepForeign = isCash && it.currency !== 'VES';
      const currency = keepForeign ? it.currency : 'VES';
      const amountMinor = keepForeign
        ? toMinor(it.workerAmount)
        : toMinor(it.workerAmount * rate);
      if (amountMinor <= 0) continue;
      const amountBsMinor = toMinor(it.workerAmount * rate);

      const detail = await this.ensurePeriodDetail(
        companyId,
        period.id,
        it.companyWorkerId,
      );
      const rateBps =
        it.serviceCost > 0
          ? Math.round((it.workerAmount / it.serviceCost) * 10000)
          : 0;

      try {
        await this.conceptRepo.save(
          this.conceptRepo.create({
            companyId,
            periodDetailId: detail.id,
            type: 'commission',
            sign: 1,
            label: it.label,
            amountMinor,
            currency,
            amountBsMinor,
            occurredAt: whenPaid,
            sourceType: 'appointment',
            sourceId: it.sessionDetailId,
            metadata: {
              rateBps,
              servicePriceMinorBs: toMinor(it.serviceCost * rate),
              currency: it.currency,
              exchangeRate: rate,
              method: method ?? null,
              ...(it.appointmentId != null
                ? { appointmentId: it.appointmentId }
                : {}),
            },
          }),
        );
        created++;
      } catch (e) {
        if (!isDupEntry(e)) throw e; // ya existía → idempotente, se omite
      }
    }

    if (created > 0) {
      this.logger.log(
        `${created} comisión(es) registrada(s) en el periodo ${period.id} (company ${companyId})`,
      );
    }
    return created;
  }

  /**
   * Genera conceptos desde las atribuciones del payload de cobro (CLYP-318):
   * comisiones y propinas, sobre servicios o productos, a cualquier empleado.
   * Un mismo ítem puede repartir a varias personas (idempotencia por
   * source + type + period_detail_id). Idempotente. Devuelve cuántos creó.
   */
  async recordAttributionConcepts(
    companyId: number,
    whenPaid: Date,
    items: AttributionConceptItem[],
    method?: string | null,
    // Período destino ya resuelto (p. ej. cobro con fecha pasada que cae en un
    // período específico). Si se omite, se usa/crea el período abierto.
    forcedPeriod?: { id: number },
  ): Promise<number> {
    if (items.length === 0) return 0;
    if (await this.isBeforeActivation(companyId, whenPaid)) return 0;

    const period =
      forcedPeriod ??
      (await this.periodService.ensureOpenPeriod(companyId, whenPaid));
    const isCash = method === 'cash' || method === 'efectivo';
    let created = 0;

    for (const it of items) {
      const rate = it.exchangeRate ?? (it.currency === 'VES' ? 1 : null);
      if (rate == null || !(it.amountItemMinor > 0)) continue;
      const keepForeign = isCash && it.currency !== 'VES';
      const currency = keepForeign ? it.currency : 'VES';
      // amountItemMinor está en minor de la moneda del ítem; a Bs = × tasa (las
      // escalas /100 se cancelan porque la tasa es por unidad entera).
      const amountBsMinor = Math.round(it.amountItemMinor * rate);
      const amountMinor = keepForeign ? it.amountItemMinor : amountBsMinor;
      if (amountMinor <= 0) continue;

      const detail = await this.ensurePeriodDetail(
        companyId,
        period.id,
        it.companyWorkerId,
      );

      try {
        await this.conceptRepo.save(
          this.conceptRepo.create({
            companyId,
            periodDetailId: detail.id,
            type: it.kind,
            sign: 1,
            label: it.label,
            amountMinor,
            currency,
            amountBsMinor,
            occurredAt: whenPaid,
            sourceType: it.sourceType,
            sourceId: it.sourceId,
            metadata: {
              ...(it.rateBps != null ? { rateBps: it.rateBps } : {}),
              currency: it.currency,
              nativeAmountMinor: it.amountItemMinor,
              exchangeRate: rate,
              method: method ?? null,
              attribution: true,
              ...(it.appointmentId != null
                ? { appointmentId: it.appointmentId }
                : {}),
              // Rol de la comisión (por rol): se muestra en nómina.
              ...(it.roleLabel ? { roleLabel: it.roleLabel } : {}),
            },
          }),
        );
        created++;
      } catch (e) {
        if (!isDupEntry(e)) throw e; // (source, type, trabajador) ya existe → idempotente
      }
    }

    if (created > 0) {
      this.logger.log(
        `${created} concepto(s) de atribución en el periodo ${period.id} (company ${companyId})`,
      );
    }
    return created;
  }

  /**
   * CLYP-362: registra DESCUENTOS absorbidos por un trabajador. Un concepto
   * negativo (type 'discount', sign −1) por ítem, con el monto ya topado para
   * que la comisión del trabajador no quede negativa. Mismo motor/tasa que las
   * atribuciones; idempotente por (source, type, trabajador).
   */
  async recordDiscountConcepts(
    companyId: number,
    whenPaid: Date,
    items: DiscountConceptItem[],
    method?: string | null,
    forcedPeriod?: { id: number },
  ): Promise<number> {
    if (items.length === 0) return 0;
    if (await this.isBeforeActivation(companyId, whenPaid)) return 0;

    const period =
      forcedPeriod ??
      (await this.periodService.ensureOpenPeriod(companyId, whenPaid));
    const isCash = method === 'cash' || method === 'efectivo';
    let created = 0;

    for (const it of items) {
      const rate = it.exchangeRate ?? (it.currency === 'VES' ? 1 : null);
      if (rate == null || !(it.amountItemMinor > 0)) continue;
      const keepForeign = isCash && it.currency !== 'VES';
      const currency = keepForeign ? it.currency : 'VES';
      const amountBsMinor = Math.round(it.amountItemMinor * rate);
      const amountMinor = keepForeign ? it.amountItemMinor : amountBsMinor;
      if (amountMinor <= 0) continue;

      const detail = await this.ensurePeriodDetail(
        companyId,
        period.id,
        it.companyWorkerId,
      );

      try {
        await this.conceptRepo.save(
          this.conceptRepo.create({
            companyId,
            periodDetailId: detail.id,
            type: 'discount',
            sign: -1,
            label: it.label,
            amountMinor,
            currency,
            amountBsMinor,
            occurredAt: whenPaid,
            sourceType: it.sourceType,
            sourceId: it.sourceId,
            metadata: {
              discount: true,
              absorbedBy: 'worker',
              reason: it.reason ?? null,
              currency: it.currency,
              nativeAmountMinor: it.amountItemMinor,
              exchangeRate: rate,
              method: method ?? null,
              ...(it.appointmentId != null
                ? { appointmentId: it.appointmentId }
                : {}),
            },
          }),
        );
        created++;
      } catch (e) {
        if (!isDupEntry(e)) throw e; // idempotente
      }
    }
    return created;
  }

  /**
   * Genera los conceptos de propina de un pago (una por cada propina que pasó
   * por la empresa). Idempotente por propina. El monto se lleva a Bs con la tasa
   * del cobro. Devuelve cuántos creó.
   */
  async recordTips(
    companyId: number,
    whenPaid: Date,
    items: TipItem[],
    method?: string | null,
  ): Promise<number> {
    if (items.length === 0) return 0;
    if (await this.isBeforeActivation(companyId, whenPaid)) return 0;

    const period = await this.periodService.ensureOpenPeriod(
      companyId,
      whenPaid,
    );
    const isCash = method === 'cash' || method === 'efectivo';
    let created = 0;

    for (const it of items) {
      const rate = it.exchangeRate ?? (it.currency === 'VES' ? 1 : null);
      if (rate == null || !(it.amount > 0)) continue;
      const keepForeign = isCash && it.currency !== 'VES';
      const currency = keepForeign ? it.currency : 'VES';
      const amountMinor = keepForeign
        ? toMinor(it.amount)
        : toMinor(it.amount * rate);
      if (amountMinor <= 0) continue;
      const amountBsMinor = toMinor(it.amount * rate);

      const detail = await this.ensurePeriodDetail(
        companyId,
        period.id,
        it.companyWorkerId,
      );

      try {
        await this.conceptRepo.save(
          this.conceptRepo.create({
            companyId,
            periodDetailId: detail.id,
            type: 'tip',
            sign: 1,
            label: 'Propina',
            amountMinor,
            currency,
            amountBsMinor,
            occurredAt: whenPaid,
            sourceType: 'tip',
            sourceId: it.tipId,
            metadata: {
              currency: it.currency,
              exchangeRate: rate,
              method: method ?? null,
              ...(it.appointmentId != null
                ? { appointmentId: it.appointmentId }
                : {}),
              ...(it.serviceName ? { serviceName: it.serviceName } : {}),
            },
          }),
        );
        created++;
      } catch (e) {
        if (!isDupEntry(e)) throw e; // ya existía → idempotente
      }
    }

    if (created > 0) {
      this.logger.log(
        `${created} propina(s) registrada(s) en el periodo ${period.id} (company ${companyId})`,
      );
    }
    return created;
  }

  /**
   * BACKFILL: al activar la nómina con una fecha pasada, recorre los cobros ya
   * hechos desde esa fecha y genera sus conceptos (comisiones + propinas), como
   * si el hook del pago hubiera corrido en su momento. Reconstruye los items
   * desde los datos persistidos (session_detail.total_worker, líneas, propinas).
   * Idempotente por origen: re-correrlo no duplica. Procesa del MÁS ANTIGUO al
   * más nuevo para que la cadena de periodos anclados se arme bien.
   *
   * Los cobros SIN `method` guardado caen en Bs (eran de antes de multi-moneda).
   */
  async backfillFromPayments(
    adminId: number,
  ): Promise<{ payments: number; commissions: number; tips: number }> {
    const company = await this.companyRepo.findOne({
      where: { userId: adminId },
    });
    if (!company) {
      throw new NotFoundException(
        'El administrador no tiene una compañía asignada',
      );
    }
    const activation = await this.periodService.resolveActivationDate(
      company.id,
    );
    if (!activation) return { payments: 0, commissions: 0, tips: 0 };

    const payments: Array<{
      id: number;
      sessionId: number;
      method: string | null;
      paidAt: string | Date;
      tipCurrency: string | null;
      tipRate: string | null;
      attributions: unknown;
    }> = await this.detailRepo.query(
      `SELECT DISTINCT sp.id AS id, sp.session_id AS sessionId, sp.method AS method,
              sp.paid_at AS paidAt, sp.tip_currency AS tipCurrency,
              sp.tip_exchange_rate AS tipRate, sp.attributions AS attributions
         FROM session_payments sp
         JOIN session_detail sd ON sd.session_id = sp.session_id
         JOIN company_worker cw ON cw.id = sd.company_worker_id
        WHERE cw.company_id = ? AND sp.paid_at >= ?
        ORDER BY sp.paid_at ASC, sp.id ASC`,
      [company.id, activation],
    );

    let commissions = 0;
    let tips = 0;

    for (const p of payments) {
      const paidAt = new Date(p.paidAt);

      // Cobro flexible: si guardó sus atribuciones resueltas, reconstruimos los
      // conceptos EXACTAMENTE desde ahí (comisiones + propinas + productos), y
      // NO derivamos de session_detail para no duplicar/divergir.
      let attributions = p.attributions;
      if (typeof attributions === 'string') {
        try {
          attributions = JSON.parse(attributions);
        } catch {
          attributions = null;
        }
      }
      if (Array.isArray(attributions) && attributions.length > 0) {
        commissions += await this.recordAttributionConcepts(
          company.id,
          paidAt,
          attributions as AttributionConceptItem[],
          p.method,
        );
        continue;
      }

      const lines: Array<{ currency: string; rate: string | null }> =
        await this.detailRepo.query(
          `SELECT UPPER(currency) AS currency, exchange_rate AS rate
             FROM session_payment_lines WHERE payment_id = ?`,
          [p.id],
        );
      const rateByCurrency = new Map(
        lines.map((l) => [l.currency, l.rate != null ? Number(l.rate) : null]),
      );

      const details: Array<{
        id: number;
        cwId: number;
        totalWorker: string | null;
        cost: string | null;
        currency: string | null;
        name: string | null;
      }> = await this.detailRepo.query(
        `SELECT sd.id AS id, sd.company_worker_id AS cwId,
                sd.total_worker AS totalWorker, sd.cost AS cost,
                UPPER(s.currency) AS currency, s.name AS name
           FROM session_detail sd LEFT JOIN service s ON s.id = sd.service_id
          WHERE sd.session_id = ? AND sd.status <> 5
            AND sd.company_worker_id IS NOT NULL AND sd.is_courtesy = 0`,
        [p.sessionId],
      );
      const commissionItems = details.map((d) => {
        const currency = (d.currency || 'USD').toUpperCase();
        const raw = rateByCurrency.get(currency);
        const rate = raw !== undefined ? raw : currency === 'VES' ? 1 : null;
        return {
          sessionDetailId: Number(d.id),
          companyWorkerId: Number(d.cwId),
          workerAmount: Number(d.totalWorker || 0),
          serviceCost: Number(d.cost || 0),
          currency,
          exchangeRate: rate,
          label: `Comisión — ${d.name || 'Servicio'}`,
          appointmentId: Number(p.sessionId),
        };
      });
      commissions += await this.recordCommissions(
        company.id,
        paidAt,
        commissionItems,
        p.method,
      );

      const tipRows: Array<{ id: number; cwId: number; amount: string }> =
        await this.detailRepo.query(
          `SELECT id, company_worker_id AS cwId, amount
             FROM session_payment_tips WHERE payment_id = ?`,
          [p.id],
        );
      const tipItems = tipRows.map((t) => ({
        tipId: Number(t.id),
        companyWorkerId: Number(t.cwId),
        amount: Number(t.amount || 0),
        currency: (p.tipCurrency || 'USD').toUpperCase(),
        exchangeRate: p.tipRate != null ? Number(p.tipRate) : null,
        appointmentId: Number(p.sessionId),
      }));
      tips += await this.recordTips(company.id, paidAt, tipItems, p.method);
    }

    this.logger.log(
      `Backfill nómina company ${company.id}: ${payments.length} cobros → ${commissions} comisiones, ${tips} propinas`,
    );
    return { payments: payments.length, commissions, tips };
  }

  /**
   * Totales POR MONEDA de cada detalle. En vivo (open/review) se suman los
   * conceptos por moneda; congelado (approved+) salen del snapshot
   * period_detail_currency. Lo pagado siempre se suma de los payouts por moneda.
   * Devuelve un mapa periodDetailId → [{currency, earned, deducted, net, paid, balance}].
   */
  private async getCurrencyBreakdown(
    periodDetailIds: number[],
    frozen: boolean,
  ): Promise<
    Map<
      number,
      Array<{
        currency: string;
        earnedMinor: number;
        deductedMinor: number;
        netMinor: number;
        paidMinor: number;
        balanceMinor: number;
      }>
    >
  > {
    const map = new Map<
      number,
      Array<{
        currency: string;
        earnedMinor: number;
        deductedMinor: number;
        netMinor: number;
        paidMinor: number;
        balanceMinor: number;
      }>
    >();
    if (periodDetailIds.length === 0) return map;

    const paidRows: Array<{ did: number; currency: string; paid: string }> =
      await this.detailRepo.query(
        `SELECT period_detail_id AS did, currency, COALESCE(SUM(amount_minor),0) AS paid
           FROM payout WHERE period_detail_id IN (?)
          GROUP BY period_detail_id, currency`,
        [periodDetailIds],
      );

    const earnRows: Array<{
      did: number;
      currency: string;
      earned: string;
      deducted: string;
      net?: string;
    }> = frozen
      ? await this.detailRepo.query(
          `SELECT period_detail_id AS did, currency,
                  earned_minor AS earned, deducted_minor AS deducted, net_minor AS net
             FROM period_detail_currency WHERE period_detail_id IN (?)`,
          [periodDetailIds],
        )
      : await this.detailRepo.query(
          `SELECT period_detail_id AS did, currency,
                  COALESCE(SUM(CASE WHEN sign = 1  THEN amount_minor ELSE 0 END),0) AS earned,
                  COALESCE(SUM(CASE WHEN sign = -1 THEN amount_minor ELSE 0 END),0) AS deducted
             FROM payroll_concept WHERE period_detail_id IN (?)
            GROUP BY period_detail_id, currency`,
          [periodDetailIds],
        );

    // did → currency → parcial
    const acc = new Map<
      number,
      Map<
        string,
        { earned: number; deducted: number; net: number; paid: number }
      >
    >();
    const cur = (did: number, currency: string) => {
      if (!acc.has(did)) acc.set(did, new Map());
      const m = acc.get(did)!;
      if (!m.has(currency))
        m.set(currency, { earned: 0, deducted: 0, net: 0, paid: 0 });
      return m.get(currency)!;
    };

    for (const r of earnRows) {
      const e = cur(Number(r.did), r.currency);
      e.earned = Number(r.earned);
      e.deducted = Number(r.deducted);
      e.net =
        r.net != null ? Number(r.net) : Number(r.earned) - Number(r.deducted);
    }
    for (const r of paidRows) {
      cur(Number(r.did), r.currency).paid = Number(r.paid);
    }

    for (const did of periodDetailIds) {
      const m = acc.get(did);
      const list = m
        ? [...m.entries()].map(([currency, v]) => ({
            currency,
            earnedMinor: v.earned,
            deductedMinor: v.deducted,
            netMinor: v.net,
            paidMinor: v.paid,
            balanceMinor: v.net - v.paid,
          }))
        : [];
      map.set(did, list);
    }
    return map;
  }

  /**
   * PAY-6: resumen del periodo para la pantalla del dueño.
   *
   * Antes de aprobar los totales se calculan EN VIVO desde los conceptos (van
   * creciendo con cada cita pagada). Una vez aprobado salen del SNAPSHOT
   * congelado, para que lo aprobado sea exactamente lo que se paga.
   *
   * Mientras el periodo esté open/review se materializa la fila de todos los
   * trabajadores activos, así la pantalla los lista a todos (y el modal de
   * concepto manual siempre tiene un periodDetailId al que apuntar).
   */
  async getPeriodSummary(periodId: number, adminId: number) {
    const period = await this.periodRepo.findOne({ where: { id: periodId } });
    if (!period) {
      throw new NotFoundException(`Periodo ${periodId} no encontrado`);
    }
    const company = await this.companyRepo.findOne({
      where: { id: period.companyId },
    });
    if (!company || company.userId !== adminId) {
      throw new ForbiddenException('No tienes permiso sobre este periodo');
    }

    const frozen = ['approved', 'paid', 'closed'].includes(period.status);

    if (!frozen) {
      const workers: Array<{ id: number }> = await this.detailRepo.query(
        'SELECT id FROM company_worker WHERE company_id = ? AND is_active = 1',
        [period.companyId],
      );
      for (const w of workers) {
        await this.ensurePeriodDetail(period.companyId, period.id, w.id);
      }
    }

    const rows: Array<{
      periodDetailId: number;
      companyWorkerId: number;
      workerName: string | null;
      picture: string | null;
      earnedMinor: string;
      deductedMinor: string;
      netMinor: string;
      paidMinor: string;
      liveEarned: string;
      liveDeducted: string;
      servicesCount: string;
      courtesyCount: string;
    }> = await this.detailRepo.query(
      `SELECT d.id AS periodDetailId,
              d.company_worker_id AS companyWorkerId,
              w.name AS workerName,
              w.picture AS picture,
              d.earned_minor AS earnedMinor,
              d.deducted_minor AS deductedMinor,
              d.net_minor AS netMinor,
              d.paid_minor AS paidMinor,
              COALESCE(SUM(CASE WHEN c.sign = 1  THEN c.amount_minor ELSE 0 END), 0) AS liveEarned,
              COALESCE(SUM(CASE WHEN c.sign = -1 THEN c.amount_minor ELSE 0 END), 0) AS liveDeducted,
              COALESCE(SUM(CASE WHEN c.type = 'commission' THEN 1 ELSE 0 END), 0) AS servicesCount,
              (SELECT COUNT(*) FROM session_detail scd
                WHERE scd.company_worker_id = d.company_worker_id
                  AND scd.is_courtesy = 1
                  AND scd.status IN (3, 4)
                  AND scd.start_datetime BETWEEN ? AND ?) AS courtesyCount
         FROM period_detail d
         LEFT JOIN company_worker cw ON cw.id = d.company_worker_id
         LEFT JOIN worker w ON w.id = cw.worker_id
         LEFT JOIN payroll_concept c ON c.period_detail_id = d.id
        WHERE d.period_id = ?
        GROUP BY d.id, d.company_worker_id, w.name, w.picture,
                 d.earned_minor, d.deducted_minor, d.net_minor, d.paid_minor
        ORDER BY w.name`,
      [period.startsAt, period.endsAt, periodId],
    );

    const breakdown = await this.getCurrencyBreakdown(
      rows.map((r) => r.periodDetailId),
      frozen,
    );

    const employees = rows.map((r) => ({
      periodDetailId: r.periodDetailId,
      companyWorkerId: r.companyWorkerId,
      workerName: (r.workerName || '').trim(),
      pictureURL: this.workerPictureUrl(r.picture),
      servicesCount: Number(r.servicesCount),
      courtesyCount: Number(r.courtesyCount),
      // Montos DESGLOSADOS POR MONEDA (VES + USD/EUR de los pagos en efectivo).
      currencies: breakdown.get(r.periodDetailId) ?? [],
    }));

    // Se puede reabrir (review → open) solo si no hay ya otro periodo abierto:
    // si el siguiente ciclo ya arrancó, no hay vuelta atrás.
    const canReopen =
      period.status === 'review'
        ? !(await this.periodService.findOpenPeriodFor(period.companyId))
        : false;

    return {
      period: {
        id: period.id,
        label: period.label,
        status: period.status,
        frequency: period.frequency,
        startsAt: period.startsAt,
        endsAt: period.endsAt,
        approvedAt: period.approvedAt,
        approvedByUserId: period.approvedByUserId,
        totalsFrozen: frozen,
        canReopen,
      },
      totals: {
        employees: employees.length,
        servicesCount: employees.reduce((a, e) => a + e.servicesCount, 0),
        courtesyCount: employees.reduce((a, e) => a + e.courtesyCount, 0),
        // Un total POR MONEDA (sin gran total en Bs).
        currencies: this.aggregateCurrencies(
          employees.flatMap((e) => e.currencies),
        ),
      },
      employees,
    };
  }

  /** Suma una lista de líneas por-moneda en un total por cada moneda. */
  private aggregateCurrencies(
    lines: Array<{
      currency: string;
      earnedMinor: number;
      deductedMinor: number;
      netMinor: number;
      paidMinor: number;
      balanceMinor: number;
    }>,
  ) {
    const m = new Map<
      string,
      {
        earnedMinor: number;
        deductedMinor: number;
        netMinor: number;
        paidMinor: number;
        balanceMinor: number;
      }
    >();
    for (const l of lines) {
      const t = m.get(l.currency) ?? {
        earnedMinor: 0,
        deductedMinor: 0,
        netMinor: 0,
        paidMinor: 0,
        balanceMinor: 0,
      };
      t.earnedMinor += l.earnedMinor;
      t.deductedMinor += l.deductedMinor;
      t.netMinor += l.netMinor;
      t.paidMinor += l.paidMinor;
      t.balanceMinor += l.balanceMinor;
      m.set(l.currency, t);
    }
    return [...m.entries()].map(([currency, t]) => ({ currency, ...t }));
  }

  /**
   * Periodo en el que el dueño está trabajando (pantalla principal de nómina).
   * NO crea nada: si la empresa nunca activó la nómina (no hay ningún periodo),
   * devuelve `{ configured: false, period: null }` para que el front muestre el
   * onboarding. Si ya hay periodos, devuelve el abierto o, si no hay, el más
   * reciente.
   */
  async getCurrentPeriodSummary(adminId: number) {
    const company = await this.companyRepo.findOne({
      where: { userId: adminId },
    });
    if (!company) {
      throw new NotFoundException(
        'El administrador no tiene una compañía asignada',
      );
    }

    let period = await this.periodService.findOpenPeriodFor(company.id);
    if (!period) {
      period = await this.periodRepo.findOne({
        where: { companyId: company.id },
        order: { startsAt: 'DESC', id: 'DESC' },
      });
    }
    if (!period) {
      // Nómina sin activar: no se inventa un periodo.
      return { configured: false, period: null, totals: null, employees: [] };
    }
    return {
      configured: true,
      ...(await this.getPeriodSummary(period.id, adminId)),
    };
  }

  /**
   * PAY-11: histórico de periodos ya no abiertos de la empresa del admin,
   * filtrable por año y paginado. Incluye los que están en `review`: si no,
   * un periodo enviado a revisión no aparecería en ninguna pantalla. Los
   * totales salen del snapshot congelado (en review todavía son 0).
   */
  async listHistoricPeriods(
    adminId: number,
    opts: {
      year?: number;
      page?: number;
      limit?: number;
      status?: PeriodStatus[];
    } = {},
  ) {
    const company = await this.companyRepo.findOne({
      where: { userId: adminId },
    });
    if (!company) {
      throw new NotFoundException(
        'El administrador no tiene una compañía asignada',
      );
    }

    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(100, Math.max(1, opts.limit ?? 12));

    // Por defecto: todo lo que ya no está abierto. Si el front pide estados
    // concretos (?status=review, o paid,closed), se respetan.
    const statuses = opts.status?.length
      ? opts.status
      : ['review', 'approved', 'paid', 'closed'];
    const statusPlaceholders = statuses.map(() => '?').join(',');

    const params: unknown[] = [company.id, ...statuses];
    let yearFilter = '';
    if (opts.year) {
      yearFilter = 'AND YEAR(p.starts_at) = ?';
      params.push(opts.year);
    }

    const countRows: Array<{ total: number }> = await this.periodRepo.query(
      `SELECT COUNT(*) AS total FROM payroll_period p
        WHERE p.company_id = ? AND p.status IN (${statusPlaceholders}) ${yearFilter}`,
      params,
    );
    const total = Number(countRows[0]?.total ?? 0);

    const rows: Array<Record<string, string | number | Date | null>> =
      await this.periodRepo.query(
        `SELECT p.id, p.label, p.status, p.frequency, p.starts_at AS startsAt,
                p.ends_at AS endsAt, p.approved_at AS approvedAt,
                COUNT(DISTINCT d.id) AS employees,
                COALESCE(SUM(d.net_minor), 0)  AS snapNet,
                COALESCE(SUM(d.paid_minor), 0) AS paidMinor,
                COALESCE((SELECT SUM(CASE WHEN c.sign = 1 THEN c.amount_minor
                                          ELSE -c.amount_minor END)
                            FROM payroll_concept c
                            JOIN period_detail d2 ON d2.id = c.period_detail_id
                           WHERE d2.period_id = p.id), 0) AS liveNet,
                (SELECT COUNT(*) FROM payroll_concept c2
                   JOIN period_detail d2 ON d2.id = c2.period_detail_id
                  WHERE d2.period_id = p.id AND c2.type = 'commission') AS servicesCount
           FROM payroll_period p
           LEFT JOIN period_detail d ON d.period_id = p.id
          WHERE p.company_id = ? AND p.status IN (${statusPlaceholders}) ${yearFilter}
          GROUP BY p.id
          ORDER BY p.starts_at DESC
          LIMIT ? OFFSET ?`,
        [...params, limit, (page - 1) * limit],
      );

    // Neto y pagado POR MONEDA de cada periodo de la página.
    const isFrozen = (s: unknown) =>
      ['approved', 'paid', 'closed'].includes(String(s));
    const periodIds = rows.map((r) => Number(r.id));
    const frozenIds = rows
      .filter((r) => isFrozen(r.status))
      .map((r) => Number(r.id));
    const reviewIds = rows
      .filter((r) => !isFrozen(r.status))
      .map((r) => Number(r.id));

    const netByPeriod = new Map<number, Map<string, number>>();
    const addNet = (pid: number, currency: string, net: number) => {
      if (!netByPeriod.has(pid)) netByPeriod.set(pid, new Map());
      netByPeriod.get(pid)!.set(currency, net);
    };
    if (frozenIds.length) {
      const q: Array<{ pid: number; currency: string; net: string }> =
        await this.periodRepo.query(
          `SELECT d.period_id AS pid, pdc.currency, COALESCE(SUM(pdc.net_minor),0) AS net
             FROM period_detail_currency pdc JOIN period_detail d ON d.id = pdc.period_detail_id
            WHERE d.period_id IN (?) GROUP BY d.period_id, pdc.currency`,
          [frozenIds],
        );
      q.forEach((r) => addNet(Number(r.pid), r.currency, Number(r.net)));
    }
    if (reviewIds.length) {
      const q: Array<{ pid: number; currency: string; net: string }> =
        await this.periodRepo.query(
          `SELECT d.period_id AS pid, c.currency,
                  COALESCE(SUM(CASE WHEN c.sign = 1 THEN c.amount_minor ELSE -c.amount_minor END),0) AS net
             FROM payroll_concept c JOIN period_detail d ON d.id = c.period_detail_id
            WHERE d.period_id IN (?) GROUP BY d.period_id, c.currency`,
          [reviewIds],
        );
      q.forEach((r) => addNet(Number(r.pid), r.currency, Number(r.net)));
    }
    const paidByPeriod = new Map<number, Map<string, number>>();
    if (periodIds.length) {
      const q: Array<{ pid: number; currency: string; paid: string }> =
        await this.periodRepo.query(
          `SELECT d.period_id AS pid, po.currency, COALESCE(SUM(po.amount_minor),0) AS paid
             FROM payout po JOIN period_detail d ON d.id = po.period_detail_id
            WHERE d.period_id IN (?) GROUP BY d.period_id, po.currency`,
          [periodIds],
        );
      q.forEach((r) => {
        const pid = Number(r.pid);
        if (!paidByPeriod.has(pid)) paidByPeriod.set(pid, new Map());
        paidByPeriod.get(pid)!.set(r.currency, Number(r.paid));
      });
    }

    return {
      data: rows.map((r) => {
        const pid = Number(r.id);
        const nets = netByPeriod.get(pid) ?? new Map<string, number>();
        const paids = paidByPeriod.get(pid) ?? new Map<string, number>();
        const codes = new Set<string>([...nets.keys(), ...paids.keys()]);
        const currencies = [...codes].map((currency) => {
          const netMinor = nets.get(currency) ?? 0;
          const paidMinor = paids.get(currency) ?? 0;
          return {
            currency,
            netMinor,
            paidMinor,
            balanceMinor: netMinor - paidMinor,
          };
        });
        return {
          id: pid,
          label: r.label,
          status: r.status,
          frequency: r.frequency,
          startsAt: r.startsAt,
          endsAt: r.endsAt,
          approvedAt: r.approvedAt,
          totalsFrozen: isFrozen(r.status),
          employees: Number(r.employees),
          servicesCount: Number(r.servicesCount),
          // Neto/pagado/saldo por moneda del periodo.
          currencies,
        };
      }),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 0,
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    };
  }

  /**
   * PAY-11: exporta un periodo a CSV (una fila por empleado) para entregárselo
   * al contador. Montos en Bs con 2 decimales.
   */
  async exportPeriodCsv(
    periodId: number,
    adminId: number,
  ): Promise<{ filename: string; csv: string }> {
    const summary = await this.getPeriodSummary(periodId, adminId);
    const esc = (v: unknown) => {
      const s = String(v ?? '');
      return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const money = (m: number) => fromMinor(m).toFixed(2);

    const lines = [
      `Periodo;${esc(summary.period.label)}`,
      `Estado;${esc(summary.period.status)}`,
      '',
      'Empleado;Moneda;Devengado;Deducciones;Neto;Pagado;Saldo',
      // Una fila por empleado y moneda (VES + USD/EUR de efectivo).
      ...summary.employees.flatMap((e) =>
        e.currencies.length
          ? e.currencies.map((c) =>
              [
                esc(e.workerName),
                c.currency,
                money(c.earnedMinor),
                money(c.deductedMinor),
                money(c.netMinor),
                money(c.paidMinor),
                money(c.balanceMinor),
              ].join(';'),
            )
          : [
              [
                esc(e.workerName),
                '—',
                '0.00',
                '0.00',
                '0.00',
                '0.00',
                '0.00',
              ].join(';'),
            ],
      ),
      '',
      // Un total por moneda.
      ...summary.totals.currencies.map((c) =>
        [
          'TOTAL',
          c.currency,
          money(c.earnedMinor),
          money(c.deductedMinor),
          money(c.netMinor),
          money(c.paidMinor),
          money(c.balanceMinor),
        ].join(';'),
      ),
    ];
    const slug = String(summary.period.label ?? `periodo-${periodId}`)
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase();
    return {
      filename: `nomina-${slug || periodId}.csv`,
      csv: lines.join('\n'),
    };
  }

  /**
   * PAY-10: arma el estado de cuenta de un empleado en un periodo (solo lectura).
   * Totales en vivo mientras el periodo está abierto; del snapshot si ya se aprobó.
   */
  private async buildStatement(
    detail: PeriodDetail,
    period: PayrollPeriod,
    // Solo el statement del admin: agrega `pendingCollection` por concepto según
    // el estado ACTUAL del cobro (no una foto). No se expone al trabajador.
    includePendingCollection = false,
  ) {
    const frozen = ['approved', 'paid', 'closed'].includes(period.status);

    const [concepts, payouts] = await Promise.all([
      this.conceptRepo.find({
        where: { periodDetailId: detail.id },
        order: { id: 'ASC' },
      }),
      this.payoutRepo.find({
        where: { periodDetailId: detail.id },
        order: { id: 'ASC' },
      }),
    ]);

    const nameRows: Array<{ name: string | null; picture: string | null }> =
      await this.detailRepo.query(
        `SELECT w.name, w.picture FROM company_worker cw
         LEFT JOIN worker w ON w.id = cw.worker_id
        WHERE cw.id = ?`,
        [detail.companyWorkerId],
      );

    // Nombre del producto para los conceptos de venta (el label pudo guardarse
    // genérico en cobros viejos). Se resuelve al mostrar desde session_product.
    const productSaleIds = [
      ...new Set(
        concepts
          .filter((c) => c.sourceType === 'product_sale' && c.sourceId != null)
          .map((c) => c.sourceId as number),
      ),
    ];
    const productNameBySp = new Map<number, string>();
    if (productSaleIds.length) {
      const rows: Array<{ id: number; name: string | null }> =
        await this.detailRepo.query(
          `SELECT sp.id AS id, p.name AS name
             FROM session_product sp JOIN product p ON p.id = sp.product_id
            WHERE sp.id IN (?)`,
          [productSaleIds],
        );
      rows.forEach((r) =>
        productNameBySp.set(Number(r.id), r.name || 'Producto'),
      );
    }
    const labelOf = (c: PayrollConcept): string => {
      if (c.sourceType === 'product_sale' && c.sourceId != null) {
        const name = productNameBySp.get(c.sourceId);
        if (name)
          return `${c.type === 'tip' ? 'Propina' : 'Comisión'} — ${name}`;
      }
      return c.label;
    };

    // Código visual (public_code) de la cita que originó cada concepto, para
    // mostrar "cita CIT-..." en vez del id crudo.
    const conceptApptId = (c: PayrollConcept): number | null => {
      const metaId = (c.metadata as { appointmentId?: number } | null)
        ?.appointmentId;
      if (metaId != null) return Number(metaId);
      if (c.sourceType === 'appointment' && c.sourceId != null)
        return Number(c.sourceId);
      return null;
    };
    const apptIds = [
      ...new Set(
        concepts.map(conceptApptId).filter((v): v is number => v != null),
      ),
    ];
    const publicCodeByAppt = new Map<number, string>();
    if (apptIds.length) {
      const rows: Array<{ id: number; publicCode: string | null }> =
        await this.detailRepo.query(
          `SELECT id, public_code AS publicCode FROM session WHERE id IN (?)`,
          [apptIds],
        );
      rows.forEach((r) => {
        if (r.publicCode) publicCodeByAppt.set(Number(r.id), r.publicCode);
      });
    }
    const apptPublicCodeOf = (c: PayrollConcept): string | null => {
      const id = conceptApptId(c);
      return id != null ? (publicCodeByAppt.get(id) ?? null) : null;
    };

    const courtesyRows: Array<{
      detailId: number;
      sessionId: number;
      publicCode: string | null;
      serviceName: string | null;
      occurredAt: Date;
      detailStatus: number;
    }> = await this.detailRepo.query(
      `SELECT sd.id AS detailId, sd.session_id AS sessionId,
              ss.public_code AS publicCode,
              s.name AS serviceName, sd.start_datetime AS occurredAt,
              sd.status AS detailStatus
         FROM session_detail sd
         LEFT JOIN service s ON s.id = sd.service_id
         LEFT JOIN session ss ON ss.id = sd.session_id
        WHERE sd.company_worker_id = ?
          AND sd.is_courtesy = 1
          AND sd.status IN (3, 4)
          AND sd.start_datetime BETWEEN ? AND ?
        ORDER BY sd.start_datetime ASC`,
      [detail.companyWorkerId, period.startsAt, period.endsAt],
    );
    const courtesies = courtesyRows.map((r) => ({
      detailId: Number(r.detailId),
      sessionId: Number(r.sessionId),
      publicCode: r.publicCode ?? null,
      serviceName: (r.serviceName || 'Servicio').trim(),
      occurredAt: r.occurredAt,
      detailStatus: Number(r.detailStatus),
    }));

    // Totales POR MONEDA (en vivo o del snapshot congelado) + saldo pagado.
    const currencyLines =
      (await this.getCurrencyBreakdown([detail.id], frozen)).get(detail.id) ??
      [];

    // Desglose por tipo DENTRO de cada moneda (monto con signo).
    const byCurType = new Map<
      string,
      Map<string, { count: number; amountMinor: number }>
    >();
    for (const c of concepts) {
      if (!byCurType.has(c.currency)) byCurType.set(c.currency, new Map());
      const t = byCurType.get(c.currency)!;
      const acc = t.get(c.type) ?? { count: 0, amountMinor: 0 };
      acc.count += 1;
      acc.amountMinor += c.amountMinor * c.sign;
      t.set(c.type, acc);
    }

    const currencies = currencyLines.map((cl) => ({
      ...cl,
      settled: cl.balanceMinor === 0 && cl.netMinor > 0,
      breakdown: [...(byCurType.get(cl.currency) ?? new Map()).entries()].map(
        ([type, v]) => ({ type, count: v.count, amountMinor: v.amountMinor }),
      ),
    }));

    // Estado de cobro EN VIVO por cita origen (solo statement del admin). Se lee
    // aquí (no del snapshot) para que el badge refleje el `collected_at` actual
    // aunque el periodo esté congelado: si el cliente paga luego, desaparece.
    const pendingByAppointment = new Map<number, boolean>();
    if (includePendingCollection) {
      const appointmentIds = [
        ...new Set(
          concepts
            .map((c) => Number(c.metadata?.appointmentId))
            .filter((n) => Number.isFinite(n) && n > 0),
        ),
      ];
      if (appointmentIds.length > 0) {
        const rows: Array<{ sessionId: number; collectedAt: Date | null }> =
          await this.detailRepo.query(
            `SELECT session_id AS sessionId, collected_at AS collectedAt
               FROM session_payments WHERE session_id IN (?)`,
            [appointmentIds],
          );
        for (const r of rows) {
          pendingByAppointment.set(Number(r.sessionId), r.collectedAt == null);
        }
      }
    }
    const pendingForConcept = (c: (typeof concepts)[number]): boolean => {
      const appt = Number(c.metadata?.appointmentId);
      if (!Number.isFinite(appt) || appt <= 0) return false; // manual → false
      return pendingByAppointment.get(appt) ?? false;
    };

    return {
      period: {
        id: period.id,
        label: period.label,
        status: period.status,
        startsAt: period.startsAt,
        endsAt: period.endsAt,
        approvedAt: period.approvedAt,
        totalsFrozen: frozen,
      },
      employee: {
        periodDetailId: detail.id,
        companyWorkerId: detail.companyWorkerId,
        workerName: (nameRows[0]?.name || '').trim(),
        pictureURL: this.workerPictureUrl(nameRows[0]?.picture),
      },
      // Un bloque por moneda: neto, pagado, saldo y su desglose por tipo.
      currencies,
      courtesyCount: courtesies.length,
      courtesies,
      concepts: concepts.map((c) => ({
        id: c.id,
        type: c.type,
        label: labelOf(c),
        sign: c.sign,
        amountMinor: c.amountMinor,
        currency: c.currency,
        amountBsMinor: c.amountBsMinor,
        sourceType: c.sourceType,
        sourceId: c.sourceId,
        metadata: c.metadata,
        // Rol de la comisión (por rol), para mostrar en nómina. null si no aplica.
        roleLabel:
          (c.metadata as { roleLabel?: string } | null)?.roleLabel ?? null,
        // Código visual de la cita origen (para mostrar "cita CIT-…").
        appointmentPublicCode: apptPublicCodeOf(c),
        // Fecha/hora real del cobro (usar esta para mostrar, no createdAt).
        occurredAt: c.occurredAt ?? c.createdAt,
        createdAt: c.createdAt,
        // Solo en el statement del admin: true si la cita origen sigue en deuda
        // (collected_at null). Refleja el estado actual del cobro.
        ...(includePendingCollection
          ? { pendingCollection: pendingForConcept(c) }
          : {}),
      })),
      payouts: payouts.map((p) => ({
        id: p.id,
        amountMinor: p.amountMinor,
        currency: p.currency,
        method: p.method,
        reference: p.reference,
        paidAt: p.paidAt,
      })),
    };
  }

  /**
   * PAY-10 (proveedor): su PROPIO estado de cuenta del periodo. Los permisos se
   * resuelven desde el token: se buscan sus membresías ACTIVAS y solo se sirve
   * el detalle que le pertenece. Nunca el de otro empleado ni el de otra empresa.
   */
  /** Membresías ACTIVAS del proveedor. Base de todos sus permisos de nómina. */
  private async resolveMemberships(
    userId: number,
  ): Promise<Array<{ id: number; company_id: number }>> {
    const rows: Array<{ id: number; company_id: number }> =
      await this.detailRepo.query(
        'SELECT id, company_id FROM company_worker WHERE user_id = ? AND is_active = 1',
        [userId],
      );
    if (rows.length === 0) {
      throw new ForbiddenException(
        'No tienes asignaciones activas en ninguna compañía',
      );
    }
    return rows;
  }

  /**
   * Periodos del proveedor (pantalla "Mi nómina"), del más reciente al más
   * viejo. Incluye el periodo ABIERTO: el punto es que vea lo que va ganando.
   * Totales en vivo mientras no esté aprobado; del snapshot después.
   */
  async listMyPeriods(
    userId: number,
    opts: { page?: number; limit?: number } = {},
  ) {
    const memberships = await this.resolveMemberships(userId);
    const myIds = memberships.map((m) => m.id);

    // Materializar su fila en el periodo abierto de cada empresa, para que el
    // periodo en curso aparezca aunque todavía no haya generado nada.
    for (const m of memberships) {
      const open = await this.periodService.findOpenPeriodFor(m.company_id);
      if (open) {
        await this.ensurePeriodDetail(m.company_id, open.id, m.id);
      }
    }

    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(100, Math.max(1, opts.limit ?? 12));

    const countRows: Array<{ total: number }> = await this.detailRepo.query(
      'SELECT COUNT(*) AS total FROM period_detail WHERE company_worker_id IN (?)',
      [myIds],
    );
    const total = Number(countRows[0]?.total ?? 0);

    const rows: Array<Record<string, string | number | Date | null>> =
      await this.detailRepo.query(
        `SELECT p.id AS periodId, d.id AS periodDetailId, p.company_id AS companyId,
                co.name AS companyName, co.logo AS companyLogo,
                p.label, p.status, p.starts_at AS startsAt, p.ends_at AS endsAt,
                d.earned_minor AS snapEarned, d.deducted_minor AS snapDeducted,
                d.net_minor AS snapNet, d.paid_minor AS paidMinor,
                COALESCE(SUM(CASE WHEN c.sign = 1  THEN c.amount_minor ELSE 0 END), 0) AS liveEarned,
                COALESCE(SUM(CASE WHEN c.sign = -1 THEN c.amount_minor ELSE 0 END), 0) AS liveDeducted,
                COALESCE(SUM(CASE WHEN c.type = 'commission' THEN 1 ELSE 0 END), 0) AS servicesCount
           FROM period_detail d
           JOIN payroll_period p ON p.id = d.period_id
           LEFT JOIN company co ON co.id = p.company_id
           LEFT JOIN payroll_concept c ON c.period_detail_id = d.id
          WHERE d.company_worker_id IN (?)
          GROUP BY d.id, p.id, p.company_id, co.name, co.logo,
                   p.label, p.status, p.starts_at, p.ends_at,
                   d.earned_minor, d.deducted_minor, d.net_minor, d.paid_minor
          ORDER BY p.starts_at DESC
          LIMIT ? OFFSET ?`,
        [myIds, limit, (page - 1) * limit],
      );

    const isFrozen = (s: unknown) =>
      ['approved', 'paid', 'closed'].includes(String(s));
    const [fb, lb] = await Promise.all([
      this.getCurrencyBreakdown(
        rows
          .filter((r) => isFrozen(r.status))
          .map((r) => Number(r.periodDetailId)),
        true,
      ),
      this.getCurrencyBreakdown(
        rows
          .filter((r) => !isFrozen(r.status))
          .map((r) => Number(r.periodDetailId)),
        false,
      ),
    ]);

    const data = rows.map((r) => {
      const frozen = isFrozen(r.status);
      const did = Number(r.periodDetailId);
      return {
        periodId: Number(r.periodId),
        periodDetailId: did,
        companyId: Number(r.companyId),
        companyName: (String(r.companyName ?? '') || '').trim() || null,
        companyLogoURL: r.companyLogo
          ? this.fileUploadService.getFileUrl(
              'company_logo',
              String(r.companyLogo),
            )
          : null,
        label: r.label,
        status: r.status,
        startsAt: r.startsAt,
        endsAt: r.endsAt,
        totalsFrozen: frozen,
        servicesCount: Number(r.servicesCount),
        // Neto/pagado/saldo DESGLOSADO POR MONEDA.
        currencies: (frozen ? fb.get(did) : lb.get(did)) ?? [],
      };
    });

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 0,
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    };
  }

  async getMyPeriodStatement(periodId: number, userId: number) {
    const memberships = await this.resolveMemberships(userId);
    const myIds = memberships.map((m) => m.id);

    const detail = await this.detailRepo.findOne({
      where: { periodId, companyWorkerId: In(myIds) },
    });
    if (!detail) {
      throw new NotFoundException('No tienes un detalle en ese periodo');
    }

    const period = await this.periodRepo.findOne({ where: { id: periodId } });
    if (
      !period ||
      !memberships.some((m) => m.company_id === period.companyId)
    ) {
      throw new ForbiddenException('No tienes permiso sobre este periodo');
    }

    return this.buildStatement(detail, period);
  }

  /** PAY-10 (admin): el estado de cuenta de cualquier empleado de SU empresa. */
  async getEmployeeStatement(periodDetailId: number, adminId: number) {
    const detail = await this.detailRepo.findOne({
      where: { id: periodDetailId },
    });
    if (!detail) {
      throw new NotFoundException(
        `Detalle de periodo ${periodDetailId} no encontrado`,
      );
    }
    const company = await this.companyRepo.findOne({
      where: { id: detail.companyId },
    });
    if (!company || company.userId !== adminId) {
      throw new ForbiddenException('No tienes permiso sobre este periodo');
    }
    const period = await this.periodRepo.findOne({
      where: { id: detail.periodId },
    });
    if (!period) {
      throw new NotFoundException(`Periodo ${detail.periodId} no encontrado`);
    }
    // Admin: incluir `pendingCollection` por concepto (badge "Cliente en deuda").
    return this.buildStatement(detail, period, true);
  }

  /**
   * PAY-7: revierte un concepto sin tocar el periodo donde nació.
   *
   * Los conceptos de periodos aprobados/pagados/cerrados son inmutables: la
   * corrección se crea como un `adjustment` de signo OPUESTO en el periodo
   * ABIERTO actual, referenciando el original (metadata.reversalOf + reason).
   * Así el pago histórico queda intacto y la corrección visible y con fecha.
   *
   * No se puede revertir dos veces el mismo concepto (se descontaría doble).
   */
  async reverseConcept(
    originalConceptId: number,
    reason: string | undefined,
    adminId: number,
  ): Promise<PayrollConcept> {
    const original = await this.conceptRepo.findOne({
      where: { id: originalConceptId },
    });
    if (!original) {
      throw new NotFoundException(
        `Concepto ${originalConceptId} no encontrado`,
      );
    }

    const company = await this.companyRepo.findOne({
      where: { id: original.companyId },
    });
    if (!company || company.userId !== adminId) {
      throw new ForbiddenException('No tienes permiso sobre este concepto');
    }

    // Una sola reversión por concepto.
    const already: Array<{ id: number }> = await this.conceptRepo.query(
      `SELECT id FROM payroll_concept
        WHERE type = 'adjustment'
          AND JSON_EXTRACT(metadata, '$.reversalOf') = ?
        LIMIT 1`,
      [originalConceptId],
    );
    if (already.length > 0) {
      throw new ConflictException(
        `El concepto ${originalConceptId} ya fue revertido (ajuste ${already[0].id})`,
      );
    }

    // La reversión va SIEMPRE al periodo abierto actual, no al original.
    const period = await this.periodService.ensureOpenPeriod(
      original.companyId,
      new Date(),
    );
    const originalDetail = await this.detailRepo.findOne({
      where: { id: original.periodDetailId },
    });
    if (!originalDetail) {
      throw new NotFoundException(
        'Detalle del concepto original no encontrado',
      );
    }
    const detail = await this.ensurePeriodDetail(
      original.companyId,
      period.id,
      originalDetail.companyWorkerId,
    );

    const reversal = await this.conceptRepo.save(
      this.conceptRepo.create({
        companyId: original.companyId,
        periodDetailId: detail.id,
        type: 'adjustment',
        sign: original.sign === 1 ? -1 : 1,
        label: `Reversión: ${original.label}`,
        amountMinor: original.amountMinor,
        // La reversión hereda la moneda del concepto original.
        currency: original.currency,
        amountBsMinor: original.amountBsMinor,
        occurredAt: new Date(),
        sourceType: 'manual',
        sourceId: null,
        createdByUserId: adminId,
        metadata: {
          reversalOf: original.id,
          reason: reason ?? null,
          originalPeriodId: originalDetail.periodId,
        },
      }),
    );

    // Si el concepto revertido era una compra de producto de un trabajador,
    // además restaurar stock y anular la venta.
    if (original.sourceType === 'product_purchase' && original.sourceId) {
      await this.restoreProductPurchase(original.sourceId, adminId);
    }

    this.logger.log(
      `Concepto ${original.id} revertido con el ajuste ${reversal.id} en el periodo ${period.id}`,
    );
    return reversal;
  }

  /**
   * PAY-8: registra un pago al empleado contra su detalle del periodo.
   *
   * Solo con el periodo `approved` (o `paid`, para saldar lo que falte). Guard
   * de sobrepago: Σ(pagos) nunca puede superar el neto congelado. Soporta pagos
   * parciales; cuando el saldo llega a 0 el empleado queda saldado.
   *
   * La fila del detalle se bloquea (FOR UPDATE) dentro de la transacción para
   * que dos pagos simultáneos no puedan colarse y pasarse del neto.
   */
  async recordPayout(
    periodDetailId: number,
    dto: CreatePayoutDto,
    adminId: number,
  ) {
    const detail = await this.detailRepo.findOne({
      where: { id: periodDetailId },
    });
    if (!detail) {
      throw new NotFoundException(
        `Detalle de periodo ${periodDetailId} no encontrado`,
      );
    }

    const company = await this.companyRepo.findOne({
      where: { id: detail.companyId },
    });
    if (!company || company.userId !== adminId) {
      throw new ForbiddenException('No tienes permiso sobre este periodo');
    }

    const period = await this.periodRepo.findOne({
      where: { id: detail.periodId },
    });
    if (!period) {
      throw new NotFoundException(`Periodo ${detail.periodId} no encontrado`);
    }
    if (period.status !== 'approved' && period.status !== 'paid') {
      throw new ConflictException(
        `El periodo está "${period.status}": solo se registran pagos una vez aprobado`,
      );
    }

    const currency = (dto.currency || 'VES').toUpperCase();
    const amountMinor = toMinor(dto.amount);
    if (amountMinor <= 0) {
      throw new UnprocessableEntityException('El monto debe ser mayor a 0');
    }

    return this.detailRepo.manager.transaction(async (m) => {
      // Bloquear la fila del detalle: serializa los pagos de este empleado.
      await m.query('SELECT id FROM period_detail WHERE id = ? FOR UPDATE', [
        periodDetailId,
      ]);
      // Saldo de ESA moneda: neto del snapshot congelado − pagado en esa moneda.
      const netRows: Array<{ net_minor: string }> = await m.query(
        'SELECT net_minor FROM period_detail_currency WHERE period_detail_id = ? AND currency = ?',
        [periodDetailId, currency],
      );
      const net = Number(netRows[0]?.net_minor ?? 0);
      const paidRows: Array<{ paid: string }> = await m.query(
        'SELECT COALESCE(SUM(amount_minor),0) AS paid FROM payout WHERE period_detail_id = ? AND currency = ?',
        [periodDetailId, currency],
      );
      const paid = Number(paidRows[0].paid);
      const balance = net - paid;

      if (net <= 0) {
        throw new UnprocessableEntityException(
          `Este empleado no tiene saldo en ${currency} en este periodo.`,
        );
      }
      if (amountMinor > balance) {
        throw new UnprocessableEntityException(
          `El pago (${fromMinor(amountMinor)} ${currency}) excede el saldo pendiente (${fromMinor(balance)} ${currency}).`,
        );
      }

      const payout = await m.save(Payout, {
        companyId: detail.companyId,
        periodDetailId,
        amountMinor,
        currency,
        method: dto.method,
        reference: dto.reference ?? null,
        recordedByUserId: adminId,
        paidAt: new Date(),
      });

      const newPaid = paid + amountMinor;
      return {
        payout,
        currency,
        netMinor: net,
        paidMinor: newPaid,
        balanceMinor: net - newPaid,
        settled: net - newPaid === 0,
      };
    });
  }

  /**
   * PAY-5: agrega un concepto manual (bono/deducción/ajuste) al detalle de un
   * empleado. Solo mientras el periodo esté `open` o `review`; después de
   * aprobado las correcciones van por reversión (PAY-7).
   *
   * El tipo define el signo; el monto se guarda SIEMPRE positivo (el invariante
   * es Neto = Σ(amount × sign)). El ajuste toma el signo del monto recibido.
   */
  async addManualConcept(
    periodDetailId: number,
    dto: CreateManualConceptDto,
    adminId: number,
  ): Promise<PayrollConcept> {
    const detail = await this.detailRepo.findOne({
      where: { id: periodDetailId },
    });
    if (!detail) {
      throw new NotFoundException(
        `Detalle de periodo ${periodDetailId} no encontrado`,
      );
    }

    const company = await this.companyRepo.findOne({
      where: { id: detail.companyId },
    });
    if (!company || company.userId !== adminId) {
      throw new ForbiddenException('No tienes permiso sobre este periodo');
    }

    const period = await this.periodRepo.findOne({
      where: { id: detail.periodId },
    });
    if (!period) {
      throw new NotFoundException(`Periodo ${detail.periodId} no encontrado`);
    }
    if (period.status !== 'open' && period.status !== 'review') {
      throw new ConflictException(
        `El periodo está "${period.status}": ya no admite conceptos. Usa un ajuste de reversión en el periodo abierto.`,
      );
    }

    const raw = Number(dto.amount);
    if (!Number.isFinite(raw) || raw === 0) {
      throw new UnprocessableEntityException('El monto no puede ser 0');
    }
    // bonus/tip: siempre suman (+). deduction: siempre resta (−).
    // adjustment: el signo lo da el monto recibido.
    const sign: 1 | -1 =
      dto.type === 'bonus' || dto.type === 'tip'
        ? 1
        : dto.type === 'deduction'
          ? -1
          : raw < 0
            ? -1
            : 1;
    const amountMinor = toMinor(Math.abs(raw));
    if (amountMinor <= 0) {
      throw new UnprocessableEntityException('El monto es demasiado pequeño');
    }

    // Moneda del concepto (VES por defecto). En divisa no hay tasa asociada, así
    // que no se guarda equivalente en Bs.
    const currency = (dto.currency || 'VES').toUpperCase();

    return this.conceptRepo.save(
      this.conceptRepo.create({
        companyId: detail.companyId,
        periodDetailId: detail.id,
        type: dto.type,
        sign,
        label: dto.label,
        amountMinor,
        currency,
        amountBsMinor: currency === 'VES' ? amountMinor : null,
        // Tasa del día para convertir a $/€ en el reporte del trabajador.
        exchangeRate: dto.exchangeRate ?? null,
        occurredAt: new Date(),
        sourceType: 'manual',
        sourceId: null,
        createdByUserId: adminId,
        metadata: dto.note ? { note: dto.note } : null,
      }),
    );
  }

  /**
   * Compra de un producto por parte de un trabajador: transacción que descuenta
   * stock, registra la venta ('worker_purchase', sin comisión) y crea la
   * deducción en su nómina (precio de venta × cantidad). Revertir esa deducción
   * (reverseConcept) restaura el stock y anula la venta.
   */
  async addProductPurchase(
    periodDetailId: number,
    dto: CreateProductPurchaseDto,
    adminId: number,
  ): Promise<PayrollConcept> {
    const detail = await this.detailRepo.findOne({
      where: { id: periodDetailId },
    });
    if (!detail) {
      throw new NotFoundException(
        `Detalle de periodo ${periodDetailId} no encontrado`,
      );
    }
    const company = await this.companyRepo.findOne({
      where: { id: detail.companyId },
    });
    if (!company || company.userId !== adminId) {
      throw new ForbiddenException('No tienes permiso sobre este periodo');
    }
    const period = await this.periodRepo.findOne({
      where: { id: detail.periodId },
    });
    if (!period) {
      throw new NotFoundException(`Periodo ${detail.periodId} no encontrado`);
    }
    if (period.status !== 'open' && period.status !== 'review') {
      throw new ConflictException(
        `El periodo está "${period.status}": ya no admite conceptos.`,
      );
    }

    const quantity = dto.quantity;

    return this.conceptRepo.manager.transaction(async (manager) => {
      const productRepo = manager.getRepository(Product);
      const spRepo = manager.getRepository(SessionProduct);
      const movementRepo = manager.getRepository(ProductStockMovement);
      const conceptRepo = manager.getRepository(PayrollConcept);

      const product = await productRepo.findOne({
        where: { id: dto.productId, companyId: detail.companyId },
      });
      if (!product) {
        throw new NotFoundException(
          `Producto ${dto.productId} no encontrado o no pertenece a tu compañía`,
        );
      }
      if (!company.allowNegativeStock && product.stock < quantity) {
        throw new ConflictException(
          `Stock insuficiente para "${product.name}" (disponible ${product.stock}, se piden ${quantity})`,
        );
      }

      const currency = (product.currency || 'VES').toUpperCase();
      const totalMinor = product.salePriceMinor * quantity;

      // La deducción SIEMPRE se hace en Bs (no en efectivo de la moneda del
      // producto). Para productos en Bs se usa el precio; para productos en
      // moneda extranjera se usa el equivalente en Bs enviado por el admin.
      const isForeign = currency !== 'VES';
      if (isForeign && (dto.amountBs == null || dto.amountBs <= 0)) {
        throw new ConflictException(
          `El producto "${product.name}" está en ${currency}: indica el monto en Bs a deducir.`,
        );
      }
      const deductionBsMinor =
        dto.amountBs != null ? toMinor(dto.amountBs) : totalMinor;

      // 1) Venta 'worker_purchase' (precio normal, sin comisión).
      const sale = await spRepo.save(
        spRepo.create({
          companyId: detail.companyId,
          sessionId: null,
          saleType: 'worker_purchase',
          productId: product.id,
          quantity,
          unitPriceMinor: product.salePriceMinor,
          currency,
          costMinor: product.costMinor * quantity,
          commissionMinor: 0,
          sellerEmployeeId: null,
          buyerEmployeeId: detail.companyWorkerId,
        }),
      );

      // 2) Descontar stock + bitácora.
      product.stock -= quantity;
      await productRepo.save(product);
      await movementRepo.save(
        movementRepo.create({
          productId: product.id,
          delta: -quantity,
          resultingStock: product.stock,
          reason: `Compra de trabajador (venta #${sale.id})`,
          createdByUserId: adminId,
        }),
      );

      // 3) Deducción en la nómina del trabajador, SIEMPRE en Bs. Para productos
      //    en moneda extranjera se guarda la tasa usada como referencia.
      return conceptRepo.save(
        conceptRepo.create({
          companyId: detail.companyId,
          periodDetailId: detail.id,
          type: 'deduction',
          sign: -1,
          label: `Compra: ${product.name}${quantity > 1 ? ` ×${quantity}` : ''}`,
          amountMinor: deductionBsMinor,
          currency: 'VES',
          amountBsMinor: deductionBsMinor,
          exchangeRate: isForeign ? (dto.exchangeRate ?? null) : null,
          occurredAt: new Date(),
          sourceType: 'product_purchase',
          sourceId: sale.id,
          createdByUserId: adminId,
          metadata: {
            productId: product.id,
            quantity,
            saleCurrency: currency,
            saleTotalMinor: totalMinor,
          },
        }),
      );
    });
  }

  /**
   * Al revertir la deducción de una compra de trabajador: restaura el stock y
   * anula (borra) la venta, para que inventario y reporte cuadren.
   */
  private async restoreProductPurchase(
    sessionProductId: number,
    adminId: number,
  ): Promise<void> {
    await this.conceptRepo.manager.transaction(async (manager) => {
      const spRepo = manager.getRepository(SessionProduct);
      const productRepo = manager.getRepository(Product);
      const movementRepo = manager.getRepository(ProductStockMovement);

      const sale = await spRepo.findOne({ where: { id: sessionProductId } });
      if (!sale || sale.saleType !== 'worker_purchase') return;

      const product = await productRepo.findOne({
        where: { id: sale.productId },
      });
      if (product) {
        product.stock += sale.quantity;
        await productRepo.save(product);
        await movementRepo.save(
          movementRepo.create({
            productId: product.id,
            delta: sale.quantity,
            resultingStock: product.stock,
            reason: `Reversión compra de trabajador (venta #${sale.id})`,
            createdByUserId: adminId,
          }),
        );
      }
      await spRepo.delete(sale.id);
    });
  }

  /**
   * Conceptos (comisiones + propinas) generados por el cobro de una cita, por
   * persona. Para el recibo de pago. Se rastrean por metadata.appointmentId.
   */
  async getConceptsByAppointment(sessionId: number): Promise<
    {
      type: string;
      label: string;
      personName: string;
      companyWorkerId: number;
      amountMinor: number;
      currency: string;
      amountBsMinor: number | null;
      // Moneda/monto nativos del ítem (comisión de servicio en $ → $), para el
      // recibo. La nómina real puede estar en Bs; esto es solo presentación.
      nativeAmountMinor: number;
      nativeCurrency: string;
      sourceType: string | null;
      sourceId: number | null;
    }[]
  > {
    const rows = await this.conceptRepo
      .createQueryBuilder('c')
      .innerJoin('period_detail', 'pd', 'pd.id = c.period_detail_id')
      .innerJoin('company_worker', 'cw', 'cw.id = pd.company_worker_id')
      .innerJoin('worker', 'w', 'w.id = cw.worker_id')
      .select('c.type', 'type')
      .addSelect('c.label', 'label')
      .addSelect('c.amount_minor', 'amountMinor')
      .addSelect('c.currency', 'currency')
      .addSelect('c.amount_bs_minor', 'amountBsMinor')
      .addSelect('c.source_type', 'sourceType')
      .addSelect('c.source_id', 'sourceId')
      .addSelect(
        "JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.currency'))",
        'metaCurrency',
      )
      .addSelect("JSON_EXTRACT(c.metadata, '$.exchangeRate')", 'metaRate')
      .addSelect(
        "JSON_EXTRACT(c.metadata, '$.nativeAmountMinor')",
        'metaNative',
      )
      .addSelect('pd.company_worker_id', 'companyWorkerId')
      .addSelect('w.name', 'personName')
      .where("JSON_EXTRACT(c.metadata, '$.appointmentId') = :sessionId", {
        sessionId,
      })
      .andWhere("c.type IN ('commission', 'tip')")
      .orderBy('c.id', 'ASC')
      .getRawMany();

    return rows.map((r) => {
      const amountMinor = Number(r.amountMinor);
      const amountBsMinor =
        r.amountBsMinor != null ? Number(r.amountBsMinor) : null;
      const nativeCurrency = (r.metaCurrency || r.currency || 'VES') as string;
      const metaRate = r.metaRate != null ? Number(r.metaRate) : null;
      let nativeAmountMinor: number;
      if (r.metaNative != null) {
        // Cobros nuevos: monto nativo guardado, exacto.
        nativeAmountMinor = Number(r.metaNative);
      } else if (
        nativeCurrency !== 'VES' &&
        metaRate &&
        metaRate > 0 &&
        amountBsMinor != null
      ) {
        // Cobros viejos: reconstruir el nativo con la tasa histórica.
        nativeAmountMinor = Math.round(amountBsMinor / metaRate);
      } else {
        nativeAmountMinor = amountMinor;
      }
      return {
        type: r.type,
        label: r.label,
        personName: (r.personName || '').trim() || 'Trabajador',
        companyWorkerId: Number(r.companyWorkerId),
        amountMinor,
        currency: r.currency,
        amountBsMinor,
        nativeAmountMinor,
        nativeCurrency,
        sourceType: r.sourceType ?? null,
        sourceId: r.sourceId != null ? Number(r.sourceId) : null,
      };
    });
  }
}
