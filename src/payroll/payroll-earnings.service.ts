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
import type { PeriodStatus } from './payroll.enums';
import { FileUploadService } from '../common/services/file_upload.service';
import { toMinor, fromMinor } from './payroll-money.util';
import { CreateManualConceptDto } from './dto/create-manual-concept.dto';
import { CreatePayoutDto } from './dto/create-payout.dto';

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
}

// Datos de una propina a registrar (una fila de session_payment_tips).
export interface TipItem {
  tipId: number; // → source_id (idempotencia)
  companyWorkerId: number;
  amount: number; // propina del worker, en tipCurrency
  currency: string; // moneda de la propina
  exchangeRate: number | null; // Bs por 1 unidad (VES = 1)
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
  ): Promise<number> {
    if (items.length === 0) return 0;
    if (await this.isBeforeActivation(companyId, whenPaid)) return 0;

    const period = await this.periodService.ensureOpenPeriod(
      companyId,
      whenPaid,
    );
    let created = 0;

    for (const it of items) {
      const rate = it.exchangeRate ?? (it.currency === 'VES' ? 1 : null);
      if (rate == null || !(it.workerAmount > 0)) continue; // sin tasa/comisión → nada
      const amountMinor = toMinor(it.workerAmount * rate);
      if (amountMinor <= 0) continue;

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
            sourceType: 'appointment',
            sourceId: it.sessionDetailId,
            metadata: {
              rateBps,
              servicePriceMinorBs: toMinor(it.serviceCost * rate),
              currency: it.currency,
              exchangeRate: rate,
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
   * Genera los conceptos de propina de un pago (una por cada propina que pasó
   * por la empresa). Idempotente por propina. El monto se lleva a Bs con la tasa
   * del cobro. Devuelve cuántos creó.
   */
  async recordTips(
    companyId: number,
    whenPaid: Date,
    items: TipItem[],
  ): Promise<number> {
    if (items.length === 0) return 0;
    if (await this.isBeforeActivation(companyId, whenPaid)) return 0;

    const period = await this.periodService.ensureOpenPeriod(
      companyId,
      whenPaid,
    );
    let created = 0;

    for (const it of items) {
      const rate = it.exchangeRate ?? (it.currency === 'VES' ? 1 : null);
      if (rate == null || !(it.amount > 0)) continue;
      const amountMinor = toMinor(it.amount * rate);
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
            type: 'tip',
            sign: 1,
            label: 'Propina',
            amountMinor,
            sourceType: 'tip',
            sourceId: it.tipId,
            metadata: { currency: it.currency, exchangeRate: rate },
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
              COALESCE(SUM(CASE WHEN c.type = 'commission' THEN 1 ELSE 0 END), 0) AS servicesCount
         FROM period_detail d
         LEFT JOIN company_worker cw ON cw.id = d.company_worker_id
         LEFT JOIN worker w ON w.id = cw.worker_id
         LEFT JOIN payroll_concept c ON c.period_detail_id = d.id
        WHERE d.period_id = ?
        GROUP BY d.id, d.company_worker_id, w.name, w.picture,
                 d.earned_minor, d.deducted_minor, d.net_minor, d.paid_minor
        ORDER BY w.name`,
      [periodId],
    );

    const employees = rows.map((r) => {
      const earned = frozen ? Number(r.earnedMinor) : Number(r.liveEarned);
      const deducted = frozen
        ? Number(r.deductedMinor)
        : Number(r.liveDeducted);
      const net = frozen ? Number(r.netMinor) : earned - deducted;
      const paid = Number(r.paidMinor);
      return {
        periodDetailId: r.periodDetailId,
        companyWorkerId: r.companyWorkerId,
        workerName: (r.workerName || '').trim(),
        pictureURL: this.workerPictureUrl(r.picture),
        servicesCount: Number(r.servicesCount),
        earnedMinor: earned,
        deductedMinor: deducted,
        netMinor: net,
        paidMinor: paid,
        balanceMinor: net - paid,
      };
    });

    const sum = (k: keyof (typeof employees)[0]) =>
      employees.reduce((acc, e) => acc + Number(e[k] ?? 0), 0);

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
        earnedMinor: sum('earnedMinor'),
        deductedMinor: sum('deductedMinor'),
        netMinor: sum('netMinor'),
        paidMinor: sum('paidMinor'),
        balanceMinor: sum('balanceMinor'),
        employees: employees.length,
        servicesCount: sum('servicesCount'),
      },
      employees,
    };
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

    return {
      data: rows.map((r) => {
        // review todavía no está congelado → total en vivo; el resto, del snapshot.
        const frozen = ['approved', 'paid', 'closed'].includes(
          String(r.status),
        );
        const netMinor = frozen ? Number(r.snapNet) : Number(r.liveNet);
        return {
          id: Number(r.id),
          label: r.label,
          status: r.status,
          frequency: r.frequency,
          startsAt: r.startsAt,
          endsAt: r.endsAt,
          approvedAt: r.approvedAt,
          totalsFrozen: frozen,
          employees: Number(r.employees),
          servicesCount: Number(r.servicesCount),
          netMinor,
          paidMinor: Number(r.paidMinor),
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
      'Empleado;Servicios;Devengado (Bs);Deducciones (Bs);Neto (Bs);Pagado (Bs);Saldo (Bs)',
      ...summary.employees.map((e) =>
        [
          esc(e.workerName),
          e.servicesCount,
          money(e.earnedMinor),
          money(e.deductedMinor),
          money(e.netMinor),
          money(e.paidMinor),
          money(e.balanceMinor),
        ].join(';'),
      ),
      [
        'TOTAL',
        summary.totals.servicesCount,
        money(summary.totals.earnedMinor),
        money(summary.totals.deductedMinor),
        money(summary.totals.netMinor),
        money(summary.totals.paidMinor),
        money(summary.totals.balanceMinor),
      ].join(';'),
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
  private async buildStatement(detail: PeriodDetail, period: PayrollPeriod) {
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

    const liveEarned = concepts
      .filter((c) => c.sign === 1)
      .reduce((a, c) => a + c.amountMinor, 0);
    const liveDeducted = concepts
      .filter((c) => c.sign === -1)
      .reduce((a, c) => a + c.amountMinor, 0);

    const earnedMinor = frozen ? detail.earnedMinor : liveEarned;
    const deductedMinor = frozen ? detail.deductedMinor : liveDeducted;
    const netMinor = frozen ? detail.netMinor : earnedMinor - deductedMinor;
    const paidMinor = detail.paidMinor;

    // Desglose por tipo (monto con signo, como se muestra en la app).
    const byType = new Map<
      string,
      { type: string; count: number; amountMinor: number }
    >();
    for (const c of concepts) {
      const acc = byType.get(c.type) ?? {
        type: c.type,
        count: 0,
        amountMinor: 0,
      };
      acc.count += 1;
      acc.amountMinor += c.amountMinor * c.sign;
      byType.set(c.type, acc);
    }

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
      totals: {
        earnedMinor,
        deductedMinor,
        netMinor,
        paidMinor,
        balanceMinor: netMinor - paidMinor,
        settled: netMinor - paidMinor === 0 && netMinor > 0,
      },
      breakdown: [...byType.values()],
      concepts: concepts.map((c) => ({
        id: c.id,
        type: c.type,
        label: c.label,
        sign: c.sign,
        amountMinor: c.amountMinor,
        sourceType: c.sourceType,
        sourceId: c.sourceId,
        metadata: c.metadata,
        createdAt: c.createdAt,
      })),
      payouts: payouts.map((p) => ({
        id: p.id,
        amountMinor: p.amountMinor,
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

    const data = rows.map((r) => {
      const frozen = ['approved', 'paid', 'closed'].includes(String(r.status));
      const earnedMinor = Number(frozen ? r.snapEarned : r.liveEarned);
      const deductedMinor = Number(frozen ? r.snapDeducted : r.liveDeducted);
      const netMinor = frozen ? Number(r.snapNet) : earnedMinor - deductedMinor;
      const paidMinor = Number(r.paidMinor);
      return {
        periodId: Number(r.periodId),
        periodDetailId: Number(r.periodDetailId),
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
        earnedMinor,
        deductedMinor,
        netMinor,
        paidMinor,
        balanceMinor: netMinor - paidMinor,
        settled: netMinor - paidMinor === 0 && netMinor > 0,
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
    return this.buildStatement(detail, period);
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

    const amountMinor = toMinor(dto.amount);
    if (amountMinor <= 0) {
      throw new UnprocessableEntityException('El monto debe ser mayor a 0');
    }

    return this.detailRepo.manager.transaction(async (m) => {
      // Bloquear la fila: el saldo que leemos no puede cambiar bajo nuestros pies.
      const locked: Array<{ net_minor: string; paid_minor: string }> =
        await m.query(
          'SELECT net_minor, paid_minor FROM period_detail WHERE id = ? FOR UPDATE',
          [periodDetailId],
        );
      const net = Number(locked[0].net_minor);
      const paid = Number(locked[0].paid_minor);
      const balance = net - paid;

      if (amountMinor > balance) {
        throw new UnprocessableEntityException(
          `El pago (${fromMinor(amountMinor)} Bs) excede el saldo pendiente (${fromMinor(balance)} Bs)`,
        );
      }

      const payout = await m.save(Payout, {
        companyId: detail.companyId,
        periodDetailId,
        amountMinor,
        method: dto.method,
        reference: dto.reference ?? null,
        recordedByUserId: adminId,
        paidAt: new Date(),
      });

      const newPaid = paid + amountMinor;
      await m.query('UPDATE period_detail SET paid_minor = ? WHERE id = ?', [
        newPaid,
        periodDetailId,
      ]);

      return {
        payout,
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
    // bonus/deduction: el tipo manda (se toma el valor absoluto).
    // adjustment: el signo lo da el monto recibido.
    const sign: 1 | -1 =
      dto.type === 'bonus'
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

    return this.conceptRepo.save(
      this.conceptRepo.create({
        companyId: detail.companyId,
        periodDetailId: detail.id,
        type: dto.type,
        sign,
        label: dto.label,
        amountMinor,
        sourceType: 'manual',
        sourceId: null,
        createdByUserId: adminId,
        metadata: dto.note ? { note: dto.note } : null,
      }),
    );
  }
}
