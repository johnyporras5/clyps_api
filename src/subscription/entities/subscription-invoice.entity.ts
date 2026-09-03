import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';
import { moneyTransformer, rateTransformer } from '../subscription-money.util';
import type { PlanId } from '../config/plans.config';

/**
 * Estado del documento de cobro.
 * - `open`: emitido y esperando el pago. Es el único que Cobrix puede conciliar.
 * - `paid`: llegó `invoice.paid` y el período se extendió.
 * - `expired`: se venció sin pagarse. El tenant puede pedir otro.
 * - `replaced`: se emitió uno nuevo porque cambiaron los datos de facturación.
 */
export type SubscriptionInvoiceStatus =
  | 'open'
  | 'paid'
  | 'expired'
  | 'replaced';

/**
 * El documento de cobro que se emite en Cobrix ANTES de que el tenant pague
 * (SUB-10).
 *
 * Es la pieza que hace posible la conciliación automática: Cobrix concilia
 * movimientos bancarios contra documentos ABIERTOS. Sin un documento emitido,
 * el Pago Móvil que entra a la cuenta de Clyps es plata que Cobrix ve pero no
 * sabe a quién aplicar, y no hay webhook que llegue.
 *
 * `provider_reference` es la clave de todo el circuito: se genera aquí, viaja a
 * Cobrix como `provider_id`, vuelve idéntica en el webhook y es lo que casa el
 * cobro con este tenant. Es ÚNICA — no se casa por monto (dos salones del mismo
 * plan pagan exactamente lo mismo) ni por referencia bancaria (que el tenant
 * escribe a mano y puede equivocar).
 *
 * Emitir una factura NO da acceso, igual que reportar no lo da: solo el pago
 * confirmado mueve la suscripción (SUB-6).
 */
@Entity('subscription_invoice')
// "¿tiene este salón una factura viva?" — la consulta del checkout.
@Index('IDX_subscription_invoice_company', ['companyId', 'status'])
export class SubscriptionInvoice {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @Column({ name: 'subscription_id' })
  subscriptionId: number;

  /** Plan que se estaba pagando cuando se emitió. */
  @Column({ name: 'plan_id', type: 'varchar', length: 20 })
  planId: PlanId;

  @Column({ name: 'provider', type: 'varchar', length: 16, default: 'cobrix' })
  provider: string;

  /** Nuestra referencia estable. Viaja como `provider_id` y vuelve en el webhook. */
  @Column({ name: 'provider_reference', type: 'varchar', length: 100 })
  providerReference: string;

  /** El id que Cobrix le puso a la factura. */
  @Column({
    name: 'provider_invoice_id',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  providerInvoiceId: string | null;

  /**
   * El enlace de pago que devuelve Cobrix. SIEMPRE se guarda el que vino en la
   * respuesta: su documentación pide explícitamente no armar el dominio a mano.
   */
  @Column({
    name: 'checkout_url',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  checkoutUrl: string | null;

  /**
   * Monto facturado en unidades mínimas, EN LA MONEDA DE LA CUENTA DE COBRIX.
   *
   * La API pública de facturas no lleva campo de moneda: solo un número. Si la
   * cuenta está en bolívares y se le manda el precio en dólares, factura "VES
   * 20,25" en vez de los Bs que valen.
   */
  @Column({
    name: 'amount_minor',
    type: 'bigint',
    transformer: moneyTransformer,
  })
  amountMinor: number;

  @Column({ name: 'currency', type: 'varchar', length: 3 })
  currency: string;

  /** Tasa USD→VES con la que se calculó el monto. Se congela aquí. */
  @Column({
    name: 'frozen_rate',
    type: 'decimal',
    precision: 18,
    scale: 4,
    nullable: true,
    transformer: rateTransformer,
  })
  frozenRate: number | null;

  @Column({ name: 'quoted_at', type: 'datetime', nullable: true })
  quotedAt: Date | null;

  /** Cédula o RIF con el que se factura: Cobrix identifica al cliente por ahí. */
  @Column({ name: 'payer_identification', type: 'varchar', length: 30 })
  payerIdentification: string;

  @Column({ name: 'status', type: 'varchar', length: 12, default: 'open' })
  status: SubscriptionInvoiceStatus;

  /**
   * Hasta cuándo vale. Pasada esta fecha la factura se cierra sola y el tenant
   * puede pedir otra: un checkout abandonado no puede dejarlo trabado.
   */
  @Column({ name: 'expires_at', type: 'datetime' })
  expiresAt: Date;

  @Column({ name: 'paid_at', type: 'datetime', nullable: true })
  paidAt: Date | null;

  /** La respuesta de Cobrix al emitirla, para poder auditar qué se pidió. */
  @Column({ name: 'provider_payload', type: 'json', nullable: true })
  providerPayload: unknown;

  @Column({
    name: 'created_at',
    type: 'datetime',
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt: Date;
}
