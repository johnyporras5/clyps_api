import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PeriodDetail } from './entities/period-detail.entity';
import { PayrollConcept } from './entities/payroll-concept.entity';
import { PayrollPeriod } from './entities/payroll-period.entity';
import { Company } from '../company/entities/company.entity';
import { PayrollPeriodService } from './payroll-period.service';
import { toMinor } from './payroll-money.util';
import { CreateManualConceptDto } from './dto/create-manual-concept.dto';

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
    private readonly periodService: PayrollPeriodService,
  ) {}

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
