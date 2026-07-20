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
  calendarBoundsFor,
  firstPeriodBoundsFor,
  periodLabel,
} from './payroll-calendar.util';

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

  /** PAY-9: frecuencia actual de la empresa del admin (para la tarjeta de config). */
  async getFrequencyConfig(
    adminId: number,
  ): Promise<{ frequency: PayrollFrequency }> {
    const companyId = await this.resolveAdminCompanyId(adminId);
    return { frequency: await this.resolveFrequency(companyId) };
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
  ): Promise<{ frequency: PayrollFrequency; realigned: boolean }> {
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
    let anchor = new Date();
    if (!hasPeriod && startDate) {
      // Mediodía UTC: evita el corrimiento de día por zona horaria.
      anchor = new Date(`${startDate}T12:00:00.000Z`);
      const bounds = firstPeriodBoundsFor(frequency, anchor);
      if (bounds.endsAt.getTime() < Date.now()) {
        throw new ConflictException(
          `La fecha ${startDate} cae en un periodo que ya terminó ` +
            `(${periodLabel(bounds.startsAt, bounds.endsAt)}). ` +
            'Elige una fecha del ciclo en curso.',
        );
      }
    }

    // Idempotente: crea el primer periodo solo si aún no hay ninguno.
    await this.bootstrapFirstPeriod(companyId, frequency, anchor);

    const realigned = await this.realignOpenPeriodIfEmpty(companyId, frequency);
    return { frequency, realigned };
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

    const bounds = firstPeriodBoundsFor(frequency, open.startsAt);
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
   * cobro caiga en un periodo abierto que la cubra. Si el abierto ya venció
   * respecto a `date`, lo rota a `review` y abre el ciclo de calendario de
   * `date` (rotación perezosa: PAY-2). El único de BD (open_marker) hace la
   * creación segura ante carreras: si dos pagos entran a la vez, uno gana y el
   * otro reusa el que quedó.
   */
  async ensureOpenPeriod(
    companyId: number,
    date: Date,
  ): Promise<PayrollPeriod> {
    const existing = await this.findOpenPeriodFor(companyId);
    if (existing) {
      // Lo cubre (o es un pago retroactivo) → se usa tal cual.
      if (date <= existing.endsAt) return existing;
      // Ya venció respecto a esta fecha → rotar y abrir el que toca.
      await this.rotateToReview(existing);
    }

    const frequency = await this.resolveFrequency(companyId);
    const bounds = calendarBoundsFor(frequency, date);
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
   * Primer periodo (bootstrap del onboarding). Idempotente: si la empresa ya
   * tiene CUALQUIER periodo, no crea otro. El primer periodo puede ser parcial
   * si el alta cae a mitad de ciclo (día 9 quincenal → 9–15).
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

    const bounds = firstPeriodBoundsFor(frequency, signupDate);
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
    await m.query(
      `UPDATE period_detail d
         LEFT JOIN (
           SELECT period_detail_id,
                  SUM(CASE WHEN sign = 1  THEN amount_minor ELSE 0 END) AS earned,
                  SUM(CASE WHEN sign = -1 THEN amount_minor ELSE 0 END) AS deducted
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
}
