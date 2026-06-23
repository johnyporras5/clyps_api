import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Unique,
} from 'typeorm';

/**
 * Marca de idempotencia para los jobs cron de notificaciones (CLYP-263 / §7).
 *
 * Una fila por (type, referenceId) indica que ese recordatorio YA se envió, para
 * que las ventanas solapadas de los crons no lo repitan.
 *
 *   type         referenceId
 *   ----         -----------
 *   reminder_client_24h / _2h / staff_1h / staff_now   → sessionId
 *   offer_expiring                                      → offerId
 *   no_appointments_30d                                 → clientId
 */
@Entity('notification_reminders')
@Unique('UQ_notification_reminders_type_ref', ['type', 'referenceId'])
export class NotificationReminder {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 40 })
  type: string;

  @Column({ name: 'reference_id' })
  referenceId: number;

  @CreateDateColumn({ name: 'sent_at' })
  sentAt: Date;
}
