import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';
import {
  nullableMoneyTransformer,
  rateTransformer,
} from '../subscription-money.util';
import type { PlanId } from '../config/plans.config';
import type {
  PaymentMethod,
  PaymentReportStatus,
  VerificationMethod,
} from '../subscription.enums';

/**
 * El reclamo de pago del tenant: "pagué esto, aquí está la referencia" (SUB-1).
 *
 * NO existe una tabla de cotizaciones. Para Pago Móvil el monto en Bs y la tasa
 * se calculan al abrir el pago (SUB-2), viajan al cliente y se CONGELAN aquí al
 * reportar (`amount_ves_minor`, `frozen_rate`, `quoted_at`). El backend revalida
 * la sanidad de la tasa al recibirla — no confía en el valor que vino del
 * cliente — y `quoted_at` es lo que permite rechazar una cotización vieja.
 *
 * Crear el reporte NO da acceso: solo `status = 'verified'` mueve la
 * suscripción (SUB-3 / SUB-4).
 */
@Entity('payment_report')
// La bandeja de conciliación: "los reportes de esta company en este estado".
@Index('IDX_payment_report_company_status', ['companyId', 'status'])
// Búsqueda por referencia: es el cruce contra el pago recibido.
@Index('IDX_payment_report_reference', ['reference'])
// OJO: el candado anti-duplicado NO se declara aquí. Es un índice único sobre
// (company_id, active_reference), una columna GENERADA que vale NULL cuando el
// reporte está rechazado — así una referencia rechazada se puede volver a
// reportar corregida. Vive solo en la migración ...058 porque TypeORM no
// modela columnas generadas de MySQL; no mapearla evita que intente escribirla.
export class PaymentReport {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @Column({ name: 'subscription_id' })
  subscriptionId: number;

  /** Plan que se estaba pagando. Se copia: el tenant puede cambiar de plan. */
  @Column({ name: 'plan_id', type: 'varchar', length: 20 })
  planId: PlanId;

  @Column({
    name: 'method',
    type: 'varchar',
    length: 16,
    default: 'pago_movil',
  })
  method: PaymentMethod;

  /**
   * Monto en céntimos de Bs. Solo Pago Móvil; null en Binance/PayPal. Es el
   * monto congelado de la cotización, no se recalcula nunca.
   */
  @Column({
    name: 'amount_ves_minor',
    type: 'bigint',
    nullable: true,
    transformer: nullableMoneyTransformer,
  })
  amountVesMinor: number | null;

  /** Monto en centavos de USD. Binance / PayPal; null en Pago Móvil. */
  @Column({
    name: 'amount_usd_minor',
    type: 'bigint',
    nullable: true,
    transformer: nullableMoneyTransformer,
  })
  amountUsdMinor: number | null;

  /** 'VES' | 'USD'. Dice cuál de los dos montos de arriba es el que aplica. */
  @Column({ name: 'currency', type: 'varchar', length: 3 })
  currency: string;

  /** Tasa USD→VES usada al cotizar. Solo Pago Móvil. */
  @Column({
    name: 'frozen_rate',
    type: 'decimal',
    precision: 18,
    scale: 4,
    nullable: true,
    transformer: rateTransformer,
  })
  frozenRate: number | null;

  /** Cuándo se calculó la cotización: sirve para validar su antigüedad. */
  @Column({ name: 'quoted_at', type: 'datetime', nullable: true })
  quotedAt: Date | null;

  /** Referencia de Pago Móvil / txId de Binance / id de PayPal. */
  @Column({ name: 'reference', type: 'varchar', length: 64 })
  reference: string;

  @Column({
    name: 'payer_phone',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  payerPhone: string | null;

  @Column({
    name: 'payer_bank_code',
    type: 'varchar',
    length: 8,
    nullable: true,
  })
  payerBankCode: string | null;

  @Column({
    name: 'payer_email',
    type: 'varchar',
    length: 145,
    nullable: true,
  })
  payerEmail: string | null;

  /** Red de la transacción en Binance (BEP20, TRC20…). Ubica el txId. */
  @Column({ name: 'network', type: 'varchar', length: 20, nullable: true })
  network: string | null;

  /** Aclaratoria libre que escribe el dueño al reportar (SUB-3). */
  @Column({ name: 'note', type: 'varchar', length: 255, nullable: true })
  note: string | null;

  /** Comprobante (imagen). Recomendado, no obligatorio. */
  @Column({
    name: 'proof_url',
    type: 'varchar',
    length: 245,
    nullable: true,
  })
  proofUrl: string | null;

  @Column({ name: 'reported_at', type: 'datetime' })
  reportedAt: Date;

  @Column({
    name: 'status',
    type: 'varchar',
    length: 16,
    default: 'reported',
  })
  status: PaymentReportStatus;

  /** Quién lo resolvió: el conciliador automático o una persona. */
  @Column({
    name: 'verification_method',
    type: 'varchar',
    length: 8,
    nullable: true,
  })
  verificationMethod: VerificationMethod | null;

  /** Solo en verificación manual. */
  @Column({ name: 'verified_by_user_id', type: 'int', nullable: true })
  verifiedByUserId: number | null;

  @Column({ name: 'verified_at', type: 'datetime', nullable: true })
  verifiedAt: Date | null;

  @Column({
    name: 'rejection_reason',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  rejectionReason: string | null;
}
