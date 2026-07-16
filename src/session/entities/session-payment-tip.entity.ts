import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity('session_payment_tips')
export class SessionPaymentTip {
  @PrimaryGeneratedColumn()
  id: number;

  @Index('IDX_session_payment_tips_payment_id')
  @Column({ name: 'payment_id' })
  paymentId: number;

  @Index('IDX_session_payment_tips_company_worker_id')
  @Column({ name: 'company_worker_id' })
  companyWorkerId: number;

  @Column({ name: 'amount', type: 'decimal', precision: 18, scale: 2 })
  amount: number;
}
