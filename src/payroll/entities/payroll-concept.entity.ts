import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
  CreateDateColumn,
} from 'typeorm';
import { moneyTransformer } from '../payroll-money.util';
import type { ConceptType, ConceptSource } from '../payroll.enums';
import { PeriodDetail } from './period-detail.entity';

/**
 * Una línea individual de nómina: ganancia (sign +1) o deducción (sign −1). Es
 * el núcleo del sistema: Neto = Σ(amount × sign) de los conceptos del empleado.
 *
 * Todo concepto autogenerado se rastrea a su origen (sourceType + sourceId →
 * cita/propina). El único (source_type, source_id, type) da idempotencia: una
 * misma cita/propina nunca genera un concepto duplicado (ver migración).
 */
@Entity('payroll_concept')
@Index('IDX_payroll_concept_company', ['companyId'])
@Index('IDX_payroll_concept_source', ['sourceType', 'sourceId'])
export class PayrollConcept {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @Column({ name: 'period_detail_id' })
  periodDetailId: number;

  @ManyToOne(() => PeriodDetail, (d) => d.concepts, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'period_detail_id' })
  periodDetail: PeriodDetail;

  @Column({ name: 'type', type: 'varchar', length: 20 })
  type: ConceptType;

  // +1 ganancia / −1 deducción. El tipo define el signo (no se captura a mano).
  @Column({ name: 'sign', type: 'tinyint' })
  sign: 1 | -1;

  @Column({ name: 'label', type: 'varchar', length: 145 })
  label: string;

  // Monto en céntimos de LA MONEDA del concepto (`currency`). En efectivo puede
  // ser USD/EUR; en el resto, Bs (VES).
  @Column({
    name: 'amount_minor',
    type: 'bigint',
    transformer: moneyTransformer,
  })
  amountMinor: number;

  // Moneda de amount_minor. VES por defecto; USD/EUR solo si se cobró en efectivo.
  @Column({ name: 'currency', type: 'varchar', length: 3, default: 'VES' })
  currency: string;

  // Equivalente en Bs (referencia para caja/reportes). = amount_minor si es VES.
  @Column({
    name: 'amount_bs_minor',
    type: 'bigint',
    nullable: true,
    transformer: moneyTransformer,
  })
  amountBsMinor: number | null;

  @Column({ name: 'source_type', type: 'varchar', length: 20, nullable: true })
  sourceType: ConceptSource | null;

  // → session_detail (comisión) / session_payment_tip (propina) / null (manual).
  @Column({ name: 'source_id', type: 'int', nullable: true })
  sourceId: number | null;

  // Quién lo agregó (conceptos manuales).
  @Column({ name: 'created_by_user_id', type: 'int', nullable: true })
  createdByUserId: number | null;

  // p. ej. { rateBps: 1500, servicePriceMinorBs: 125000 } o { reversalOf, reason }.
  @Column({ name: 'metadata', type: 'json', nullable: true })
  metadata: Record<string, any> | null;

  // Fecha/hora REAL del concepto (cuándo se cobró la cita). En el flujo en vivo
  // ≈ created_at; en el backfill es la fecha del cobro original, no la de hoy.
  @Column({ name: 'occurred_at', type: 'datetime', nullable: true })
  occurredAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
