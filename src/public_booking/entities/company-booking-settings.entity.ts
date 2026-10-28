import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import type { BookingMode, DepositType } from '../booking-modes.enums';

@Entity('company_booking_settings')
export class CompanyBookingSettings {
  @PrimaryColumn({ name: 'company_id' })
  companyId: number;

  @Column({ name: 'mode', type: 'varchar', length: 10, default: 'free' })
  mode: BookingMode;

  @Column({ name: 'lead_minutes', type: 'int', default: 60 })
  leadMinutes: number;

  @Column({ name: 'hold_hours', type: 'int', default: 24 })
  holdHours: number;

  @Column({ name: 'workers_can_approve', type: 'boolean', default: false })
  workersCanApprove: boolean;

  @Column({ name: 'deposit_type', type: 'varchar', length: 10, nullable: true })
  depositType: DepositType | null;

  @Column({
    name: 'deposit_amount',
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  depositAmount: string | null;

  @Column({ name: 'deposit_percent', type: 'int', nullable: true })
  depositPercent: number | null;

  @Column({
    name: 'deposit_currency',
    type: 'varchar',
    length: 3,
    nullable: true,
  })
  depositCurrency: string | null;

  @Column({
    name: 'payment_instructions',
    type: 'varchar',
    length: 1000,
    nullable: true,
  })
  paymentInstructions: string | null;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
