import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * Historial de un cobro revertido (auditoría). Guarda el snapshot completo del
 * cobro que se deshizo + quién/cuándo/por qué. Ver CreatePaymentReversal.
 */
@Entity('session_payment_reversal')
@Index('IDX_payment_reversal_session', ['sessionId'])
@Index('IDX_payment_reversal_company', ['companyId'])
export class SessionPaymentReversal {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'session_id' })
  sessionId: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @Column({ name: 'reverted_by_user_id' })
  revertedByUserId: number;

  @Column({ name: 'reason', type: 'varchar', length: 255 })
  reason: string;

  // Cobro completo revertido: método, referencia, total_bs, collected_at,
  // discounts, attributions, lines, tips.
  @Column({ name: 'payment_snapshot', type: 'json' })
  paymentSnapshot: unknown;

  // Conceptos de nómina que se deshicieron (borrados o revertidos).
  @Column({ name: 'concepts_snapshot', type: 'json', nullable: true })
  conceptsSnapshot: unknown | null;

  // Productos vendidos en el cobro cuyo stock se restauró.
  @Column({ name: 'products_snapshot', type: 'json', nullable: true })
  productsSnapshot: unknown | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
