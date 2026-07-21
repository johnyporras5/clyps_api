import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  OneToMany,
} from 'typeorm';
import type { PeriodStatus, PayrollFrequency } from '../payroll.enums';
import { PeriodDetail } from './period-detail.entity';

/**
 * Un ciclo de pago de UNA compañía (p. ej. "16–31 mayo 2026"). Avanza por la
 * máquina de estados open → review → approved → paid → closed (guard en PAY-2).
 */
@Entity('payroll_period')
@Index('IDX_payroll_period_company_status', ['companyId', 'status'])
export class PayrollPeriod {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @Column({ name: 'label', type: 'varchar', length: 100 })
  label: string;

  @Column({ name: 'status', type: 'varchar', length: 20, default: 'open' })
  status: PeriodStatus;

  // Frecuencia bajo la que se creó el periodo. Se congela: un cambio de config
  // posterior no redimensiona un periodo ya abierto (PAY-9).
  @Column({ name: 'frequency', type: 'varchar', length: 20 })
  frequency: PayrollFrequency;

  // Límites del ciclo, calculados en la zona del negocio (business-time.util).
  @Column({ name: 'starts_at', type: 'datetime' })
  startsAt: Date;

  @Column({ name: 'ends_at', type: 'datetime' })
  endsAt: Date;

  // Auditoría de aprobación (PAY-6).
  @Column({ name: 'approved_by_user_id', type: 'int', nullable: true })
  approvedByUserId: number | null;

  @Column({ name: 'approved_at', type: 'datetime', nullable: true })
  approvedAt: Date | null;

  @OneToMany(() => PeriodDetail, (d) => d.period)
  details: PeriodDetail[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
