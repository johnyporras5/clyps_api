import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { PayrollPeriod } from './entities/payroll-period.entity';
import { PayrollConfig } from './entities/payroll-config.entity';
import { Company } from '../company/entities/company.entity';
import { PayrollFrequency, PeriodStatus } from './payroll.enums';
import { canTransition } from './payroll-period.state';
import {
  anchoredBoundsFromStart,
  anchoredWindowContaining,
  nextChainStart,
  periodLabel,
} from './payroll-calendar.util';
import { businessDateOf } from '../common/utils/business-time.util';

const isDupEntry = (e: unknown): boolean =>
  (e as { code?: string; driverError?: { code?: string } })?.code ===
    'ER_DUP_ENTRY' ||
  (e as { driverError?: { code?: string } })?.driverError?.code ===
    'ER_DUP_ENTRY';

@Injectable()
export class PayrollPeriodService {
  private readonly logger = new Logger(PayrollPeriodService.name);

  constructor(
    @InjectRepository(PayrollPeriod)
    private readonly periodRepo: Repository<PayrollPeriod>,
    @InjectRepository(PayrollConfig)
    private readonly configRepo: Repository<PayrollConfig>,
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
  ) {}

  /** Frecuencia configurada de la empresa (default quincenal si no hay config). */
  async resolveFrequency(companyId: number): Promise<PayrollFrequency> {
    const cfg = await this.configRepo.findOne({ where: { companyId } });
    return cfg?.frequency ?? 'quincenal';
  }

  /** Company del admin autenticado (la que posee). */
  private async resolveAdminCompanyId(adminId: number): Promise<number> {
    const company = await this.companyRepo.findOne({
      where: { userId: adminId },
    });
    if (!company) {
      throw new NotFoundException(
        'El administrador no tiene una compañía asignada',
      );
    }
    return company.id;
  }

  /**
   * PAY-9: frecuencia actual de la empresa del admin (para la tarjeta de config).
   * `configured` = ya existe un periodo (la nómina ya arrancó). El front lo usa
   * para decidir: `false` → onboarding (muestra el date-picker de inicio);
   * `true` → solo el selector de frecuencia.
   */
  async getFrequencyConfig(adminId: number): Promise<{
    frequency: PayrollFrequency;
    configured: boolean;
    canRevert: boolean;
  }> {
    const companyId = await this.resolveAdminCompanyId(adminId);
    const hasPeriod = await this.periodRepo.findOne({
      where: { companyId },
      order: { id: 'ASC' },
    });
    return {
      frequency: await this.resolveFrequency(companyId),
      configured: !!hasPeriod,
      // Solo se puede revertir la nómina recién activada (ver canRevert).
      canRevert: await this.canRevert(companyId),
    };
  }

  /**
   * ¿Se puede "empezar de 0" (revertir la activación)? Solo la PRIMERA vez recién
   * configurada: un único periodo, aún ABIERTO (sin rotar a un segundo), y sin
   * ningún pago registrado. En cuanto la nómina se usa de verdad (rota, se aprueba
   * o se paga) deja de ser reversible.
   */
  async canRevert(companyId: number): Promise<boolean> {
    const periods = await this.periodRepo.find({ where: { companyId } });
    if (periods.length !== 1 || periods[0].status !== 'open') return false;
    const rows: Array<{ n: number }> = await this.periodRepo.query(
      `SELECT COUNT(*) AS n FROM payout WHERE company_id = ?`,
      [companyId],
    );
    return Number(rows[0]?.n ?? 0) === 0;
  }

  /**
   * "Empezar de 0": borra TODA la nómina de la empresa (config + periodos +
   * detalles + conceptos + payouts + snapshots) y la deja sin configurar, para
   * reconfigurar frecuencia/fecha desde cero. Solo si `canRevert` (primera vez,
   * un único periodo abierto, sin pagos). No toca citas ni cobros.
   */
  async revertActivation(adminId: number): Promise<{ reverted: true }> {
    const companyId = await this.resolveAdminCompanyId(adminId);
    if (!(await this.canRevert(companyId))) {
      throw new ConflictException(
        'Solo se puede revertir la nómina recién activada: un único periodo ' +
          'abierto, sin pagos ni aprobaciones.',
      );
    }
    // Borrado hijo → padre, en transacción, acotado a la company.
    await this.periodRepo.manager.transaction(async (m) => {
      await m.query('DELETE FROM payout WHERE company_id = ?', [companyId]);
      await m.query('DELETE FROM payroll_concept WHERE company_id = ?', [
        companyId,
      ]);
      await m.query(
        `DELETE FROM period_detail_currency WHERE period_detail_id IN
           (SELECT id FROM period_detail WHERE company_id = ?)`,
        [companyId],
      );
      await m.query('DELETE FROM period_detail WHERE company_id = ?', [
        companyId,
      ]);
      await m.query('DELETE FROM payroll_period WHERE company_id = ?', [
        companyId,
      ]);
      await m.query('DELETE FROM payroll_config WHERE company_id = ?', [
        companyId,
      ]);
    });
    this.logger.log(
      `Nómina de company ${companyId} revertida a "sin configurar" por admin ${adminId}`,
    );
    return { reverted: true };
  }

  /**
   * PAY-9: fija la frecuencia de pago. El cambio aplica al PRÓXIMO periodo: el
   * abierto actual no se toca (su frecuencia quedó congelada). La primera vez
   * (sin periodo aún) dispara el bootstrap del primer periodo, anclado a
   * `startDate` si el admin lo eligió (p. ej. la nómina ya venía corriendo) o a
   * hoy si no. `startDate` solo aplica en ese primer arranque.
   */
  async setFrequency(
    adminId: number,
    frequency: PayrollFrequency,
    startDate?: string,
  ): Promise<{
    frequency: PayrollFrequency;
    realigned: boolean;
    firstActivation: boolean;
  }> {
    const companyId = await this.resolveAdminCompanyId(adminId);

    const cfg = await this.configRepo.findOne({ where: { companyId } });
    if (cfg) {
      cfg.frequency = frequency;
      await this.configRepo.save(cfg);
    } else {
      await this.configRepo.save(
        this.configRepo.create({ companyId, frequency }),
      );
    }

    // ¿Es el primer arranque? Solo entonces vale la fecha elegida.
    const hasPeriod = await this.periodRepo.findOne({
      where: { companyId },
      order: { id: 'ASC' },
    });
    const firstActivation = !hasPeriod;
    let anchor = new Date();
    if (firstActivation && startDate) {
      // Se permite arrancar hasta un mes atrás (para traer lo ya cobrado), pero
      // no más allá.
      const monthAgo = new Date();
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      const minDate = businessDateOf(monthAgo);
      if (startDate < minDate) {
        throw new ConflictException(
          `La fecha de inicio (${startDate}) no puede ser de más de un mes atrás (mínimo ${minDate}).`,
        );
      }
      // Mediodía UTC: evita el corrimiento de día por zona horaria.
      anchor = new Date(`${startDate}T12:00:00.000Z`);
    }

    // Idempotente: crea el primer periodo solo si aún no hay ninguno.
    await this.bootstrapFirstPeriod(companyId, frequency, anchor);

    const realigned = await this.realignOpenPeriodIfEmpty(companyId, frequency);
    return { frequency, realigned, firstActivation };
  }

  /**
   * Si el periodo abierto todavía no tiene conceptos, se reajusta a la nueva
   * frecuencia (cubre el "me equivoqué al configurar"). En cuanto tiene dinero
   * adentro ya no se toca: el cambio aplica al próximo.
   */
  private async realignOpenPeriodIfEmpty(
    companyId: number,
    frequency: PayrollFrequency,
  ): Promise<boolean> {
    const open = await this.findOpenPeriodFor(companyId);
    if (!open || open.frequency === frequency) return false;

    const rows: Array<{ n: number }> = await this.periodRepo.query(
      `SELECT COUNT(*) AS n FROM payroll_concept c
         JOIN period_detail d ON d.id = c.period_detail_id
        WHERE d.period_id = ?`,
      [open.id],
    );
    if (Number(rows[0]?.n ?? 0) > 0) return false;

    // Se recalcula el fin manteniendo el MISMO día de inicio elegido.
    const bounds = anchoredBoundsFromStart(
      businessDateOf(open.startsAt),
      frequency,
    );
    open.frequency = frequency;
    open.startsAt = bounds.startsAt;
    open.endsAt = bounds.endsAt;
    open.label = periodLabel(bounds.startsAt, bounds.endsAt);
    await this.periodRepo.save(open);

    this.logger.log(
      `Periodo ${open.id} (vacío) reajustado a ${frequency}: ${open.label}`,
    );
    return true;
  }

  /** El (único) periodo abierto de la empresa, o null. */
  findOpenPeriodFor(companyId: number): Promise<PayrollPeriod | null> {
    return this.periodRepo.findOne({ where: { companyId, status: 'open' } });
  }

  /**
   * Día desde el que la nómina empieza a contar = inicio del primer periodo (lo
   * que el admin eligió al activarla). Los cobros anteriores no entran. null si
   * la empresa aún no tiene ningún periodo.
   */
  async resolveActivationDate(companyId: number): Promise<Date | null> {
    const rows: Array<{ s: string | Date | null }> =
      await this.periodRepo.query(
        'SELECT MIN(starts_at) AS s FROM payroll_period WHERE company_id = ?',
        [companyId],
      );
    const s = rows[0]?.s;
    return s ? new Date(s) : null;
  }

  private createOpenPeriod(
    companyId: number,
    bounds: { startsAt: Date; endsAt: Date },
    frequency: PayrollFrequency,
  ): Promise<PayrollPeriod> {
    return this.periodRepo.save(
      this.periodRepo.create({
        companyId,
        status: 'open',
        frequency,
        startsAt: bounds.startsAt,
        endsAt: bounds.endsAt,
        label: periodLabel(bounds.startsAt, bounds.endsAt),
      }),
    );
  }

  /**
   * Cierra el periodo abierto que ya venció: lo pasa a `review` para poder abrir
   * el siguiente (solo puede haber un `open` a la vez). No congela nada —eso es
   * al aprobar—, solo marca "esta ventana terminó, falta que la revises".
   */
  private async rotateToReview(period: PayrollPeriod): Promise<void> {
    if (period.status !== 'open') return;
    period.status = 'review';
    await this.periodRepo.save(period);
    this.logger.log(
      `Periodo ${period.id} (${period.label}) venció; pasa a review para abrir el siguiente`,
    );
  }

  /**
   * Apertura diferida (se llama al PAGAR una cita): garantiza que la fecha del
   * cobro caiga en un periodo abierto que la cubra. Los periodos van ANCLADOS al
   * día que el admin eligió al arrancar: cada uno empieza donde terminó el
   * anterior. Si el abierto ya venció respecto a `date`, lo rota a `review` y
   * abre la ventana anclada que contiene `date` (saltando huecos vacíos). El
   * único de BD (open_marker) hace la creación segura ante carreras.
   */
  async ensureOpenPeriod(
    companyId: number,
    date: Date,
  ): Promise<PayrollPeriod> {
    const frequency = await this.resolveFrequency(companyId);
    const existing = await this.findOpenPeriodFor(companyId);

    let chainStart: string;
    if (existing) {
      // Lo cubre (o es un pago retroactivo) → se usa tal cual.
      if (date <= existing.endsAt) return existing;
      // Ya venció → rotar y encadenar el siguiente desde donde este terminó.
      await this.rotateToReview(existing);
      chainStart = nextChainStart(existing.startsAt, existing.frequency);
    } else {
      // Sin abierto: encadenar desde el último periodo, o anclar en `date`.
      const latest = await this.periodRepo.findOne({
        where: { companyId },
        order: { startsAt: 'DESC', id: 'DESC' },
      });
      chainStart = latest
        ? nextChainStart(latest.startsAt, latest.frequency)
        : businessDateOf(date);
    }

    const bounds = anchoredWindowContaining(frequency, chainStart, date);
    try {
      const created = await this.createOpenPeriod(companyId, bounds, frequency);
      this.logger.log(
        `Periodo abierto ${created.id} creado para company ${companyId} (${created.label})`,
      );
      return created;
    } catch (e) {
      if (isDupEntry(e)) {
        const open = await this.findOpenPeriodFor(companyId);
        if (open) return open;
      }
      throw e;
    }
  }

  /**
   * Resuelve el período que CONTIENE una fecha, sin importar su estado (abierto o
   * cerrado). Para cobros con fecha pasada: la comisión debe caer en el período
   * de esa fecha. Si no existe ninguno que la cubra, cae en `ensureOpenPeriod`
   * (crea la ventana anclada). `needsConfirm` = true si el período no está abierto
   * (el front debe confirmar antes de sumarle conceptos y recongelar).
   */
  async resolvePeriodForDate(
    companyId: number,
    date: Date,
  ): Promise<{ period: PayrollPeriod; needsConfirm: boolean }> {
    const containing = await this.periodRepo
      .createQueryBuilder('p')
      .where('p.company_id = :companyId', { companyId })
      .andWhere('p.starts_at <= :date AND p.ends_at >= :date', { date })
      .orderBy('p.starts_at', 'DESC')
      .getOne();

    if (containing) {
      return { period: containing, needsConfirm: containing.status !== 'open' };
    }
    // Ninguno la cubre → usar/crear el abierto anclado (comportamiento normal).
    const period = await this.ensureOpenPeriod(companyId, date);
    return { period, needsConfirm: false };
  }

  /**
   * Primer periodo (bootstrap del onboarding). Idempotente: si la empresa ya
   * tiene CUALQUIER periodo, no crea otro. Arranca EXACTO en `signupDate` (el día
   * que el admin eligió) y corre lo que dure la frecuencia. La nómina no cuenta
   * nada antes de ese día.
   */
  async bootstrapFirstPeriod(
    companyId: number,
    frequency: PayrollFrequency,
    signupDate: Date,
  ): Promise<PayrollPeriod> {
    const any = await this.periodRepo.findOne({
      where: { companyId },
      order: { id: 'ASC' },
    });
    if (any) return any;

    // Fijar la frecuencia si aún no hay config (no pisar una elección posterior).
    const cfg = await this.configRepo.findOne({ where: { companyId } });
    if (!cfg) {
      await this.configRepo.save(
        this.configRepo.create({ companyId, frequency }),
      );
    }

    const bounds = anchoredBoundsFromStart(
      businessDateOf(signupDate),
      frequency,
    );
    try {
      return await this.createOpenPeriod(companyId, bounds, frequency);
    } catch (e) {
      if (isDupEntry(e)) {
        const open = await this.findOpenPeriodFor(companyId);
        if (open) return open;
      }
      throw e;
    }
  }

  /**
   * Cambia el estado del periodo respetando la máquina de estados. Solo el admin
   * dueño de la empresa. Al aprobar, registra la auditoría (quién/cuándo). El
   * congelado de totales es PAY-6.
   */
  async changeStatus(
    periodId: number,
    newStatus: PeriodStatus,
    adminId: number,
    confirmUncharged?: boolean,
  ): Promise<PayrollPeriod> {
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

    if (!canTransition(period.status, newStatus)) {
      throw new ConflictException(
        `Transición inválida: ${period.status} → ${newStatus}`,
      );
    }

    // Candado: al cerrar el período actual (open→review), avisar si quedan citas
    // Completadas SIN cobrar dentro de él (evita cobrarlas luego y que la comisión
    // caiga en el período siguiente).
    if (
      period.status === 'open' &&
      newStatus === 'review' &&
      !confirmUncharged
    ) {
      const pending = await this.countUnchargedInPeriod(period);
      if (pending > 0) {
        throw new ConflictException({
          code: 'UNCHARGED_APPOINTMENTS',
          message: `Hay ${pending} cita(s) completada(s) sin cobrar en este período. Cóbralas antes de cerrar, o confirma para cerrar de todos modos (sus comisiones caerían en el período siguiente).`,
          count: pending,
        });
      }
    }

    // Reabrir (review → open) solo si no hay ya otro periodo abierto: si el
    // siguiente ciclo ya arrancó, el tiempo avanzó y no se puede devolver.
    if (period.status === 'review' && newStatus === 'open') {
      const open = await this.findOpenPeriodFor(period.companyId);
      if (open && open.id !== period.id) {
        throw new ConflictException(
          'No puedes reabrir este periodo: el siguiente ciclo ya comenzó ' +
            `(${open.label}). Las correcciones van por ajuste en el periodo abierto.`,
        );
      }
    }

    period.status = newStatus;
    if (newStatus === 'approved') {
      period.approvedByUserId = adminId;
      period.approvedAt = new Date();
      // Congelar totales y aprobar en una sola transacción: lo aprobado es
      // exactamente lo que se paga.
      return this.periodRepo.manager.transaction(async (m) => {
        await this.freezeTotals(periodId, m);
        return m.save(PayrollPeriod, period);
      });
    }
    return this.periodRepo.save(period);
  }

  /**
   * PAY-6: toma la "foto" de los totales de cada empleado del periodo, sumando
   * sus conceptos (Neto = Σ amount × sign). A partir de aquí los totales salen
   * de este snapshot, no de un recálculo en vivo.
   */
  async freezeTotals(periodId: number, manager?: EntityManager): Promise<void> {
    const m = manager ?? this.periodRepo.manager;

    // Snapshot POR MONEDA (period_detail_currency): se rehace desde los conceptos.
    await m.query(
      `DELETE pdc FROM period_detail_currency pdc
         JOIN period_detail d ON d.id = pdc.period_detail_id
        WHERE d.period_id = ?`,
      [periodId],
    );
    await m.query(
      `INSERT INTO period_detail_currency
          (period_detail_id, currency, earned_minor, deducted_minor, net_minor)
       SELECT c.period_detail_id, c.currency,
              SUM(CASE WHEN c.sign = 1  THEN c.amount_minor ELSE 0 END),
              SUM(CASE WHEN c.sign = -1 THEN c.amount_minor ELSE 0 END),
              SUM(CASE WHEN c.sign = 1  THEN c.amount_minor ELSE 0 END)
                - SUM(CASE WHEN c.sign = -1 THEN c.amount_minor ELSE 0 END)
         FROM payroll_concept c
         JOIN period_detail d ON d.id = c.period_detail_id
        WHERE d.period_id = ?
        GROUP BY c.period_detail_id, c.currency`,
      [periodId],
    );

    // Se mantienen las columnas escalares con el EQUIVALENTE EN Bs (referencia
    // para caja/CSV; los totales al trabajador van por moneda).
    await m.query(
      `UPDATE period_detail d
         LEFT JOIN (
           SELECT period_detail_id,
                  SUM(CASE WHEN sign = 1  THEN COALESCE(amount_bs_minor, amount_minor) ELSE 0 END) AS earned,
                  SUM(CASE WHEN sign = -1 THEN COALESCE(amount_bs_minor, amount_minor) ELSE 0 END) AS deducted
             FROM payroll_concept
            GROUP BY period_detail_id
         ) c ON c.period_detail_id = d.id
          SET d.earned_minor   = COALESCE(c.earned, 0),
              d.deducted_minor = COALESCE(c.deducted, 0),
              d.net_minor      = COALESCE(c.earned, 0) - COALESCE(c.deducted, 0)
        WHERE d.period_id = ?`,
      [periodId],
    );
  }

  /**
   * Cuenta las citas Completadas (status 3) SIN cobrar dentro de la ventana del
   * período (excluye cortesías, que no se cobran). Usado por el candado al cerrar.
   */
  private async countUnchargedInPeriod(period: PayrollPeriod): Promise<number> {
    const rows: Array<{ n: string }> = await this.periodRepo.manager.query(
      `SELECT COUNT(DISTINCT sd.session_id) AS n
         FROM session_detail sd
         JOIN company_worker cw ON cw.id = sd.company_worker_id
        WHERE cw.company_id = ?
          AND sd.status = 3
          AND sd.is_courtesy = 0
          AND sd.start_datetime >= ? AND sd.start_datetime <= ?`,
      [period.companyId, period.startsAt, period.endsAt],
    );
    return Number(rows[0]?.n ?? 0) || 0;
  }
}
