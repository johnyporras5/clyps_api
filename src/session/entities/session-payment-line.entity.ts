import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('session_payment_lines')
export class SessionPaymentLine {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'payment_id' })
  paymentId: number;

  @Column({ name: 'currency', type: 'varchar', length: 10 })
  currency: string;

  @Column({ name: 'subtotal', type: 'decimal', precision: 18, scale: 2 })
  subtotal: number;

  @Column({
    name: 'exchange_rate',
    type: 'decimal',
    precision: 18,
    scale: 4,
    nullable: true,
  })
  exchangeRate: number | null;

  @Column({
    name: 'subtotal_bs',
    type: 'decimal',
    precision: 18,
    scale: 2,
    nullable: true,
  })
  subtotalBs: number | null;
}
