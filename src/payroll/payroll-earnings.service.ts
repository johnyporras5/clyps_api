import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PeriodDetail } from './entities/period-detail.entity';
import { PayrollConcept } from './entities/payroll-concept.entity';
import { PayrollPeriodService } from './payroll-period.service';
import { toMinor } from './payroll-money.util';

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

@Injectable()
export class PayrollEarningsService {
  private readonly logger = new Logger(PayrollEarningsService.name);

  constructor(
    @InjectRepository(PeriodDetail)
    private readonly detailRepo: Repository<PeriodDetail>,
    @InjectRepository(PayrollConcept)
    private readonly conceptRepo: Repository<PayrollConcept>,
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
}
