import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { moneyTransformer } from '../payroll-money.util';
import { PeriodDetail } from './period-detail.entity';

@Entity('period_detail_currency')
@Index('IDX_pdc_detail', ['periodDetailId'])
export class PeriodDetailCurrency {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'period_detail_id' })
  periodDetailId: number;

  @ManyToOne(() => PeriodDetail, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'period_detail_id' })
  periodDetail: PeriodDetail;

  @Column({ name: 'currency', type: 'varchar', length: 3 })
  currency: string;

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
}
