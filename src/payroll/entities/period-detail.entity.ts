import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  OneToMany,
  Index,
  Unique,
} from 'typeorm';
import { moneyTransformer } from '../payroll-money.util';
import { PayrollPeriod } from './payroll-period.entity';
import { PayrollConcept } from './payroll-concept.entity';
import { Payout } from './payout.entity';

/**
 * Una fila POR EMPLEADO POR PERIODO. Cachea los totales del empleado en ese
 * periodo (todo en céntimos de Bs). Los totales se CONGELAN al aprobar (PAY-6);
 * desde ahí los números mostrados salen de este caché, no de un recálculo.
 */
@Entity('period_detail')
@Index('IDX_period_detail_company_period', ['companyId', 'periodId'])
// Garantía a nivel BD del get-or-create: un solo detalle por (periodo, empleado),
// seguro incluso ante dos finalizaciones simultáneas.
@Unique('UQ_period_detail_period_worker', ['periodId', 'companyWorkerId'])
export class PeriodDetail {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @Column({ name: 'period_id' })
  periodId: number;

  @ManyToOne(() => PayrollPeriod, (p) => p.details, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'period_id' })
  period: PayrollPeriod;

  // El empleado (→ company_worker.id).
  @Column({ name: 'company_worker_id' })
  companyWorkerId: number;

  // Totales en caché (céntimos de Bs). Se congelan al aprobar.
  @Column({
    name: 'earned_minor',
    type: 'bigint',
    default: 0,
    transformer: moneyTransformer,
  })
  earnedMinor: number;

  @Column({
    name: 'deducted_minor',
    type: 'bigint',
    default: 0,
    transformer: moneyTransformer,
  })
  deductedMinor: number;

  @Column({
    name: 'net_minor',
    type: 'bigint',
    default: 0,
    transformer: moneyTransformer,
  })
  netMinor: number;

  @Column({
    name: 'paid_minor',
    type: 'bigint',
    default: 0,
    transformer: moneyTransformer,
  })
  paidMinor: number;

  @OneToMany(() => PayrollConcept, (c) => c.periodDetail)
  concepts: PayrollConcept[];

  @OneToMany(() => Payout, (p) => p.periodDetail)
  payouts: Payout[];
}
