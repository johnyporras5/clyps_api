import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';
import type { PlanId } from '../config/plans.config';
import type { SubscriptionStatus } from '../subscription.enums';

/** Qué provocó el cambio en la suscripción. */
export type SubscriptionEventType = 'payment_verified';

/**
 * Bitácora de los cambios de la suscripción (SUB-6 / CLYP-337).
 *
 * Responde la pregunta de auditoría del ticket: QUÉ reporte extendió QUÉ
 * período. La suscripción sola no puede contestarla — solo guarda la foto
 * actual, no cómo llegó ahí.
 *
 * `payment_report_id` es ÚNICO: es lo que hace idempotente al avance. Si el
 * mismo pago intenta extender dos veces, la segunda choca contra el índice y no
 * regala otro mes. Va en la BD y no solo en el servicio porque dos llamadas
 * simultáneas pasan cualquier comprobación previa.
 */
@Entity('subscription_event')
@Index('IDX_subscription_event_company', ['companyId', 'createdAt'])
export class SubscriptionEvent {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @Column({ name: 'subscription_id' })
  subscriptionId: number;

  /** El reporte que provocó el avance. null si el evento no vino de un pago. */
  @Column({ name: 'payment_report_id', type: 'int', nullable: true })
  paymentReportId: number | null;

  @Column({ name: 'type', type: 'varchar', length: 24 })
  type: SubscriptionEventType;

  /** Plan que quedó vigente tras el evento. */
  @Column({ name: 'plan_id', type: 'varchar', length: 20 })
  planId: PlanId;

  @Column({
    name: 'previous_status',
    type: 'varchar',
    length: 16,
    nullable: true,
  })
  previousStatus: SubscriptionStatus | null;

  @Column({ name: 'new_status', type: 'varchar', length: 16 })
  newStatus: SubscriptionStatus;

  /** Hasta dónde llegaba el acceso antes. null si nunca había pagado. */
  @Column({ name: 'previous_period_end', type: 'datetime', nullable: true })
  previousPeriodEnd: Date | null;

  /** Hasta dónde llega después. Es el período que compró ese pago. */
  @Column({ name: 'new_period_end', type: 'datetime' })
  newPeriodEnd: Date;

  @Column({
    name: 'created_at',
    type: 'datetime',
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt: Date;
}
