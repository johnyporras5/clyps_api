import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import type { PlanId } from '../config/plans.config';
import type { SubscriptionStatus } from '../subscription.enums';

/**
 * Suscripción de una company (el tenant). Un registro por company — lo respalda
 * un índice único sobre `company_id` (SUB-1 / CLYP-333).
 *
 * Nace en `trialing` con `trial_ends_at = now + 15 días` al iniciar el
 * onboarding, SIN pedir tarjeta. El acceso no se deriva de una sola fecha: se
 * lee `status` junto con la fecha que corresponda a ese estado (`trial_ends_at`
 * en prueba, `current_period_end` pagando, `grace_ends_at` en gracia).
 *
 * El plan NO se guarda con sus límites: `plan_id` apunta al catálogo en código
 * (`plans.config.ts`), que es la única fuente de precios y entitlements.
 */
@Entity('subscription')
// Barrido de vencimientos y recordatorios: "quién vence pronto en este estado".
@Index('IDX_subscription_status_period', ['status', 'currentPeriodEnd'])
export class Subscription {
  @PrimaryGeneratedColumn()
  id: number;

  /** Una sola suscripción por company: la unicidad la impone la BD. */
  @Column({ name: 'company_id', unique: true })
  companyId: number;

  @Column({ name: 'plan_id', type: 'varchar', length: 20 })
  planId: PlanId;

  @Column({
    name: 'status',
    type: 'varchar',
    length: 16,
    default: 'trialing',
  })
  status: SubscriptionStatus;

  /** Fin de la prueba de 15 días. */
  @Column({ name: 'trial_ends_at', type: 'datetime', nullable: true })
  trialEndsAt: Date | null;

  /** Hasta cuándo llega el acceso ya pagado. */
  @Column({ name: 'current_period_end', type: 'datetime', nullable: true })
  currentPeriodEnd: Date | null;

  /** Fin de la gracia de 5 días; pasado esto se bloquea. */
  @Column({ name: 'grace_ends_at', type: 'datetime', nullable: true })
  graceEndsAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
