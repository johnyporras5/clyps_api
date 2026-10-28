import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { BookingRequestStatus } from '../booking-modes.enums';

@Entity('public_booking_request')
@Index('IDX_public_booking_request_company_status', ['companyId', 'status'])
export class PublicBookingRequest {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'session_id', type: 'int', unique: true })
  sessionId: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'status', type: 'varchar', length: 20 })
  status: BookingRequestStatus;

  @Column({ name: 'guest_name', type: 'varchar', length: 145 })
  guestName: string;

  @Column({ name: 'guest_email', type: 'varchar', length: 145 })
  guestEmail: string;

  @Column({ name: 'guest_phone', type: 'varchar', length: 20, nullable: true })
  guestPhone: string | null;

  @Column({ name: 'expires_at', type: 'datetime', nullable: true })
  expiresAt: Date | null;

  @Column({
    name: 'deposit_amount',
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  depositAmount: string | null;

  @Column({
    name: 'deposit_currency',
    type: 'varchar',
    length: 3,
    nullable: true,
  })
  depositCurrency: string | null;

  @Column({
    name: 'payment_reference',
    type: 'varchar',
    length: 60,
    nullable: true,
  })
  paymentReference: string | null;

  @Column({
    name: 'payment_proof_url',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  paymentProofUrl: string | null;

  @Column({
    name: 'rejection_reason',
    type: 'varchar',
    length: 300,
    nullable: true,
  })
  rejectionReason: string | null;

  @Column({ name: 'reviewed_by_user_id', type: 'int', nullable: true })
  reviewedByUserId: number | null;

  @Column({ name: 'reviewed_at', type: 'datetime', nullable: true })
  reviewedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
