import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';
import type { ReminderChannel, ReminderTier } from '../subscription.enums';

/**
 * Un registro por recordatorio de cobro efectivamente enviado (SUB-1).
 *
 * Es la bitácora que hace idempotente al job de recordatorios: antes de enviar
 * el aviso "d-3" de un período, se pregunta si ya existe la fila
 * (company, tier, period_end). Por eso `period_end` guarda el
 * `current_period_end` al que apunta el aviso y no la fecha de envío: si el
 * período se renueva, el mismo tier vuelve a ser enviable.
 */
@Entity('reminder_log')
@Index('IDX_reminder_log_company_tier_period', [
  'companyId',
  'tier',
  'periodEnd',
])
export class ReminderLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  /** 'd-7' | 'd-3' | 'd-1' | 'd0' | 'grace'. */
  @Column({ name: 'tier', type: 'varchar', length: 16 })
  tier: ReminderTier;

  /** El `current_period_end` al que apunta el recordatorio. */
  @Column({ name: 'period_end', type: 'datetime' })
  periodEnd: Date;

  /** 'in_app' | 'email' | 'whatsapp'. */
  @Column({ name: 'channel', type: 'varchar', length: 16 })
  channel: ReminderChannel;

  @Column({
    name: 'sent_at',
    type: 'datetime',
    default: () => 'CURRENT_TIMESTAMP',
  })
  sentAt: Date;
}
