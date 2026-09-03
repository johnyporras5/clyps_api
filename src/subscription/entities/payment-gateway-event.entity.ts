import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

/**
 * De cuál de los dos canales de Cobrix vino.
 * - `invoice`: protocolo `cobrix_invoice_v1`, el que confirma el cobro.
 * - `general`: el que avisa que el dueño terminó el checkout.
 */
export type GatewayEventChannel = 'invoice' | 'general';

/** Qué hizo Clyps con el evento. Es la auditoría del webhook. */
export type GatewayEventOutcome =
  /** Recibido y todavía sin resolver (estado inicial de la fila). */
  | 'received'
  /** Casó con una factura y dejó el pago verificado (SUB-6 corrió). */
  | 'verified'
  /** Casó, pero no se dio por bueno solo: va a la cola manual (SUB-4). */
  | 'manual_review'
  /** Ninguna referencia coincidió con una factura nuestra. */
  | 'unmatched'
  /** La factura ya estaba cobrada antes de llegar el evento. */
  | 'already_resolved'
  /** Evento de un tipo que no mueve nada aquí (creación, checkout, ping). */
  | 'ignored';

/**
 * Los webhooks que Cobrix nos entregó (SUB-10).
 *
 * Existe por DOS razones y en este orden:
 *
 * 1. IDEMPOTENCIA. Cobrix reparte at-least-once y reintenta a los ~5 min, 30
 *    min, 2 h y 24 h: el mismo evento llega varias veces. `event_id` es ÚNICO
 *    por proveedor, así que el segundo intento choca contra el índice y no
 *    vuelve a extender la suscripción. El candado va en la BD y no en el
 *    servicio porque dos entregas simultáneas pasan cualquier comprobación
 *    previa.
 *
 *    ⚠️ El canal de documentos NO trae un id de evento propio: se compone con
 *    tipo + factura + pago, que identifica la misma operación en cada reentrega.
 *
 * 2. AUDITORÍA. Guarda el payload crudo y qué se decidió con él. Cuando un
 *    tenant reclame "pagué y no se activó", esta tabla dice si el webhook llegó,
 *    con qué referencia y por qué no casó.
 *
 * Solo se escribe DESPUÉS de validar la firma: un webhook sin firma válida no
 * deja fila, se registra en el log y se descarta.
 */
@Entity('payment_gateway_event')
@Index('IDX_payment_gateway_event_report', ['paymentReportId'])
export class PaymentGatewayEvent {
  @PrimaryGeneratedColumn()
  id: number;

  /** Hoy siempre 'cobrix'. La columna deja entrar otro conciliador sin migrar. */
  @Column({ name: 'provider', type: 'varchar', length: 16, default: 'cobrix' })
  provider: string;

  @Column({ name: 'channel', type: 'varchar', length: 16, default: 'invoice' })
  channel: GatewayEventChannel;

  /** Único junto al proveedor: es lo que hace idempotente el webhook. */
  @Column({ name: 'event_id', type: 'varchar', length: 160 })
  eventId: string;

  /** `invoice.paid`, `checkout.session.completed`, … */
  @Column({ name: 'event_type', type: 'varchar', length: 60 })
  eventType: string;

  /** El reporte que quedó verificado o marcado. null si no casó con ninguno. */
  @Column({ name: 'payment_report_id', type: 'int', nullable: true })
  paymentReportId: number | null;

  /** La factura con la que casó. */
  @Column({ name: 'invoice_id', type: 'int', nullable: true })
  invoiceId: number | null;

  /** Nuestra referencia (`provider_id`) que traía el evento. Para diagnosticar. */
  @Column({
    name: 'provider_reference',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  providerReference: string | null;

  @Column({ name: 'outcome', type: 'varchar', length: 24, default: 'received' })
  outcome: GatewayEventOutcome;

  /** Explicación corta del `outcome`. Es lo que se lee en soporte. */
  @Column({ name: 'detail', type: 'varchar', length: 255, nullable: true })
  detail: string | null;

  /** El payload tal cual llegó, ya validada la firma. */
  @Column({ name: 'payload', type: 'json' })
  payload: unknown;

  @Column({
    name: 'received_at',
    type: 'datetime',
    default: () => 'CURRENT_TIMESTAMP',
  })
  receivedAt: Date;

  @Column({ name: 'processed_at', type: 'datetime', nullable: true })
  processedAt: Date | null;
}
