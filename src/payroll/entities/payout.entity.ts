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
import type { PayoutMethod } from '../payroll.enums';
import { PeriodDetail } from './period-detail.entity';

/**
 * Un pago registrado contra el detalle de un empleado. Separado de los conceptos
 * (los conceptos son ganancias/deducciones; los payouts son lo que ya se pagó).
 * Soporta pagos parciales: saldo = net_minor − Σ(payouts).
 */
@Entity('payout')
@Index('IDX_payout_company', ['companyId'])
@Index('IDX_payout_period_detail', ['periodDetailId'])
export class Payout {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @Column({ name: 'period_detail_id' })
  periodDetailId: number;

  // RESTRICT: no se puede borrar un detalle que ya tiene pagos registrados.
  @ManyToOne(() => PeriodDetail, (d) => d.payouts, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'period_detail_id' })
  periodDetail: PeriodDetail;

  @Column({
    name: 'amount_minor',
    type: 'bigint',
    transformer: moneyTransformer,
  })
  amountMinor: number;

  @Column({ name: 'method', type: 'varchar', length: 20 })
  method: PayoutMethod;

  @Column({ name: 'reference', type: 'varchar', length: 145, nullable: true })
  reference: string | null;

  // Auditoría: quién registró el pago.
  @Column({ name: 'recorded_by_user_id' })
  recordedByUserId: number;

  @Column({ name: 'paid_at', type: 'datetime' })
  paidAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
