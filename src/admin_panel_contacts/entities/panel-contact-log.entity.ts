import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** Por dónde se le escribió al salón. */
export const CONTACT_CHANNELS = [
  'whatsapp',
  'instagram',
  'facebook',
  'tiktok',
  'call',
  'email',
  'other',
] as const;
export type ContactChannel = (typeof CONTACT_CHANNELS)[number];

/** Cómo quedó ese contacto. */
export const CONTACT_OUTCOMES = [
  'no_reply',
  'replied',
  'interested',
  'not_interested',
] as const;
export type ContactOutcome = (typeof CONTACT_OUTCOMES)[number];

/**
 * Una vez que el administrador de la plataforma le escribió a un salón (por
 * WhatsApp, Instagram, una llamada...). Ver la migración 087.
 *
 * Va por la CUENTA del dueño (`user_id`), igual que `panel_hidden_owner`:
 * cada fila del panel es un dueño, tenga salón o no.
 */
@Entity('panel_contact_log')
@Index('IDX_panel_contact_log_user_date', ['userId', 'contactedAt'])
export class PanelContactLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id', type: 'int' })
  userId: number;

  @Column({ type: 'varchar', length: 20 })
  channel: ContactChannel;

  @Column({ type: 'varchar', length: 20 })
  outcome: ContactOutcome;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  note: string | null;

  /** Día en que toca volver a escribirle ('YYYY-MM-DD'). Sin hora a propósito. */
  @Column({ name: 'follow_up_on', type: 'date', nullable: true })
  followUpOn: string | null;

  /** Cuándo se le escribió. Puede ser anterior a `created_at` (se anotó tarde). */
  @Column({ name: 'contacted_at', type: 'datetime' })
  contactedAt: Date;

  /** Administrador que lo anotó (sale del token). */
  @Column({ name: 'created_by', type: 'int', nullable: true })
  createdBy: number | null;

  @Column({ name: 'created_at', type: 'datetime' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'datetime' })
  updatedAt: Date;
}
