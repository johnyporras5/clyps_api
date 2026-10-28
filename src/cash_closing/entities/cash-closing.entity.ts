import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import type { CashClosingStatus } from '../cash-closing.enums';
import type { ClosingLine, CurrencyAmount } from '../cash-closing.util';

@Entity('cash_closing')
@Index('IDX_cash_closing_company_date', ['companyId', 'date'])
export class CashClosing {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @Column({ name: 'date', type: 'date' })
  date: string;

  @Column({ name: 'version', type: 'int' })
  version: number;

  @Column({ name: 'status', type: 'varchar', length: 10 })
  status: CashClosingStatus;

  @Column({ name: 'opening_cash', type: 'json' })
  openingCash: CurrencyAmount[];

  @Column({ name: 'closing_lines', type: 'json' })
  lines: ClosingLine[];

  @Column({ name: 'retained_cash', type: 'json' })
  retainedCash: CurrencyAmount[];

  @Column({ name: 'has_difference', type: 'boolean', default: false })
  hasDifference: boolean;

  @Column({ name: 'notes', type: 'varchar', length: 500, nullable: true })
  notes: string | null;

  @Column({ name: 'closed_by_user_id', type: 'int' })
  closedByUserId: number;

  @CreateDateColumn({ name: 'closed_at' })
  closedAt: Date;

  @Column({ name: 'reverted_by_user_id', type: 'int', nullable: true })
  revertedByUserId: number | null;

  @Column({ name: 'reverted_at', type: 'datetime', nullable: true })
  revertedAt: Date | null;

  @Column({
    name: 'revert_reason',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  revertReason: string | null;
}
