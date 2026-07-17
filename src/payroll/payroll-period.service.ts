import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
   * Apertura diferida (red de seguridad, se llama al PAGAR una cita): si no hay
   * periodo abierto, crea el del ciclo de calendario de `date`. El único de BD
   * (open_marker) hace la creación segura ante carreras: si dos pagos entran a
   * la vez, uno gana y el otro reusa el que quedó.
   */
  async ensureOpenPeriod(
    companyId: number,
    date: Date,
  ): Promise<PayrollPeriod> {
    const existing = await this.findOpenPeriodFor(companyId);
    if (existing) return existing;

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

    period.status = newStatus;
    if (newStatus === 'approved') {
      period.approvedByUserId = adminId;
      period.approvedAt = new Date();
    }
    return this.periodRepo.save(period);
  }
}
