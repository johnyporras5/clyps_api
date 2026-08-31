import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

/**
 * Métodos de pago aceptados en el registro de cobro de una cita.
 */
export const PAYMENT_METHODS = [
  'cash',
  'mobile_payment',
  'transfer',
  'card',
  'other',
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/**
 * Cobro registrado al marcar una cita como pagada (uno por cita).
 *
 * Los montos en Bs y las tasas se guardan tal como se cobraron (histórico):
 * NUNCA se recalculan con tasas futuras. `session_id` es único: una cita solo
 * puede tener un cobro (idempotencia, respaldada por la constraint).
 */
@Entity('session_payments')
export class SessionPayment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'session_id', unique: true })
  sessionId: number;

  // Método de pago (enum PAYMENT_METHODS) — opcional.
  @Column({ name: 'method', type: 'varchar', length: 20, nullable: true })
  method: string | null;

  // Referencia bancaria — opcional.
  @Column({ name: 'reference', type: 'varchar', length: 64, nullable: true })
  reference: string | null;

  // Moneda de la propina (regla del front: USD, o EUR si todo es EUR).
  @Column({ name: 'tip_currency', type: 'varchar', length: 10, nullable: true })
  tipCurrency: string | null;

  // Propina total, en tipCurrency.
  @Column({
    name: 'tip',
    type: 'decimal',
    precision: 18,
    scale: 2,
    nullable: true,
  })
  tip: number | null;

  // Tasa Bs por 1 unidad de tipCurrency al momento del cobro.
  @Column({
    name: 'tip_exchange_rate',
    type: 'decimal',
    precision: 18,
    scale: 4,
    nullable: true,
  })
  tipExchangeRate: number | null;

  // Propina convertida a Bs con la tasa histórica.
  @Column({
    name: 'tip_bs',
    type: 'decimal',
    precision: 18,
    scale: 2,
    nullable: true,
  })
  tipBs: number | null;

  // Gran total (servicios + propina) en Bs; null si faltó alguna tasa.
  @Column({
    name: 'total_bs',
    type: 'decimal',
    precision: 18,
    scale: 2,
    nullable: true,
  })
  totalBs: number | null;

  // userId del admin que registró el cobro.
  @Column({ name: 'paid_by' })
  paidBy: number;

  @Column({ name: 'paid_at', type: 'datetime' })
  paidAt: Date;

  // Cuándo la company cobró de verdad al cliente. null = en deuda (se le pagó al
  // worker pero el cliente aún no paga).
  @Column({ name: 'collected_at', type: 'datetime', nullable: true })
  collectedAt: Date | null;

  // Ajuste a favor (o en contra) de la company en Bs
  @Column({
    name: 'company_adjustment_bs',
    type: 'decimal',
    precision: 18,
    scale: 2,
    nullable: true,
  })
  companyAdjustmentBs: number | null;

  // true si el cobro nació "en deuda" (pendingCollection). Distingue las cuentas
  // por cobrar (pendientes o ya saldadas con el check) de un cobro normal. Un
  // cobro normal NUNCA aparece en "Cuentas por cobrar".
  @Column({ name: 'was_pending', type: 'tinyint', width: 1, default: 0 })
  wasPending: boolean;

  // CLYP-318/314: atribuciones resueltas del cobro flexible (comisiones/propinas
  // por persona). Se guardan para reconstruir los conceptos de nómina al
  // reactivar la nómina. null en cobros sin atribuciones (derivan de session_detail).
  @Column({ name: 'attributions', type: 'json', nullable: true })
  attributions: unknown[] | null;

  // CLYP-362: descuentos aplicados por servicio (auditoría). Cada uno:
  // { sessionDetailId, mode, value, absorbedBy, workerId, reason, appliedByUserId }.
  @Column({ name: 'discounts', type: 'json', nullable: true })
  discounts: unknown[] | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
