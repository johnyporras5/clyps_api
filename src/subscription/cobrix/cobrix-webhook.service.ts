import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { PaymentReport } from '../entities/payment-report.entity';
import { SubscriptionInvoice } from '../entities/subscription-invoice.entity';
import {
  PaymentGatewayEvent,
  type GatewayEventChannel,
  type GatewayEventOutcome,
} from '../entities/payment-gateway-event.entity';
import { PaymentsService } from '../payments.service';
import { CURRENCY_VES } from '../subscription-money.util';
import { CobrixConfig } from './cobrix.config';
import {
  verifyCobrixInvoiceSignature,
  verifyCobrixSignature,
  type SignatureCheck,
  type SignatureHeaders,
} from './cobrix-signature.util';
import {
  COBRIX_EVENT_INVOICE_PAID,
  eventIdOf,
  eventNameOf,
  findProviderReference,
  parseCobrixInvoiceEvent,
  type CobrixInvoiceEvent,
} from './cobrix-event.util';

/** Lo que se le contesta a Cobrix. Con 2xx deja de reintentar. */
export interface CobrixAck {
  received: true;
  /** Qué se hizo. 'duplicate' = ese evento ya estaba procesado. */
  outcome: GatewayEventOutcome | 'duplicate';
}

const PROVIDER = 'cobrix';

/**
 * Eventos del canal general que significan "el dueño terminó de reportar su
 * pago en el checkout de Cobrix". No confirman nada: solo avisan que hay un
 * pago en camino.
 */
const CHECKOUT_COMPLETED_EVENTS = new Set([
  'checkout.session.completed',
  'checkout.collection_document_session.completed',
]);

/**
 * Los webhooks de Cobrix: la otra forma de pasar un pago de `reported` a
 * `verified` (SUB-10).
 *
 * Sustituye el CLIC DEL ADMIN, no el pago. La verificación manual (SUB-4) sigue
 * intacta como respaldo.
 *
 * ⚠️ SON DOS CANALES CON DOS FIRMAS Y DOS SECRETOS DISTINTOS:
 *
 * - `cobrix_invoice_v1` (documentos) — el que CONFIRMA el cobro con
 *   `invoice.paid`. Firma: HMAC del cuerpo crudo, sin timestamp.
 * - General — el que avisa `checkout.session.completed`. Firma:
 *   `t=…,v1=…` sobre `timestamp.cuerpo`, con ventana de 300 s.
 *
 * No son intercambiables: usar la fórmula del otro canal rechaza todos los
 * eventos en silencio.
 *
 * Tres reglas que no se negocian:
 *
 * 1. FIRMA PRIMERO. No se mira el monto ni el estado hasta verificar el HMAC.
 *    El endpoint es público —lo llama Cobrix, no un usuario logueado—, así que
 *    la firma es todo lo que separa un cobro real de alguien activándose la
 *    suscripción con un curl.
 * 2. IDEMPOTENCIA POR EVENTO. Cobrix reparte at-least-once y reintenta cuatro
 *    veces; el candado único de `payment_gateway_event` hace que la segunda
 *    entrega no compre otro mes.
 * 3. LO QUE NO CUADRA VA A MANUAL, NO SE RECHAZA. Un monto distinto o una
 *    factura que no aparece deja el reporte en `reported` para que lo mire una
 *    persona (SUB-4). Rechazar de verdad tiene consecuencias para el tenant y
 *    lo firma un humano.
 */
@Injectable()
export class CobrixWebhookService {
  private readonly logger = new Logger(CobrixWebhookService.name);

  constructor(
    @InjectRepository(PaymentReport)
    private readonly reports: Repository<PaymentReport>,
    @InjectRepository(SubscriptionInvoice)
    private readonly invoices: Repository<SubscriptionInvoice>,
    @InjectRepository(PaymentGatewayEvent)
    private readonly events: Repository<PaymentGatewayEvent>,
    private readonly payments: PaymentsService,
    private readonly cobrix: CobrixConfig,
  ) {}

  // ---------------------------------------------------------------------------
  // Canal de documentos: el que confirma el cobro
  // ---------------------------------------------------------------------------

  /**
   * `invoice.paid` y compañía. Recibe el cuerpo CRUDO —no el JSON ya parseado—
   * porque volver a serializarlo reordena claves y cambia el espaciado, y
   * entonces la firma no cuadra nunca.
   */
  async handleInvoiceWebhook(
    rawBody: Buffer | undefined,
    signature: string | undefined,
  ): Promise<CobrixAck> {
    if (!rawBody?.length)
      throw new BadRequestException('Webhook de Cobrix sin cuerpo.');

    this.assertSigned(
      verifyCobrixInvoiceSignature(
        rawBody,
        signature,
        this.cobrix.webhookSecret,
      ),
      'documentos',
    );

    const payload = this.parseJson(rawBody);
    const event = parseCobrixInvoiceEvent(payload);
    if (!event) {
      // Firma válida pero no se entiende: se registra ENTERO. Un evento real en
      // el log vale más que cualquier suposición sobre su forma.
      this.logger.warn(
        `[cobrix] Webhook de documentos con firma válida y cuerpo ilegible: ${JSON.stringify(
          payload,
        ).slice(0, 800)}`,
      );
      return { received: true, outcome: 'ignored' };
    }

    const row = await this.record('invoice', event.eventId, event.eventType, {
      providerReference: event.providerReference,
      payload,
    });
    if (!row) return { received: true, outcome: 'duplicate' };

    return this.processInvoiceEvent(event, row);
  }

  private async processInvoiceEvent(
    event: CobrixInvoiceEvent,
    row: PaymentGatewayEvent,
  ): Promise<CobrixAck> {
    // `invoice.created` lo provocamos nosotros y `invoice.canceled` lo resuelve
    // el vencimiento de la factura: ninguno de los dos activa nada.
    if (event.eventType !== COBRIX_EVENT_INVOICE_PAID)
      return this.finish(
        row,
        'ignored',
        `El evento ${event.eventType} no confirma ningún cobro.`,
      );

    if (!event.providerReference)
      return this.finish(
        row,
        'unmatched',
        'El evento no trae nuestra referencia (provider_id).',
      );

    const invoice = await this.invoices.findOne({
      where: { providerReference: event.providerReference },
    });
    if (!invoice)
      return this.finish(
        row,
        'unmatched',
        `No hay factura con la referencia ${event.providerReference}.`,
      );
    row.invoiceId = invoice.id;

    if (invoice.status === 'paid')
      return this.finish(
        row,
        'already_resolved',
        `La factura ${invoice.providerReference} ya estaba cobrada.`,
      );

    const mismatch = this.amountMismatch(invoice, event);
    if (mismatch) {
      // No se auto-verifica NI se auto-rechaza: un pago parcial o una factura
      // tocada a mano en el panel de Cobrix la mira una persona.
      const report = await this.findReport(invoice);
      if (report)
        await this.payments.flagForManualReview(report, 'rejected', mismatch, {
          gatewayPaymentId: event.paymentId,
        });
      this.logger.error(`[cobrix] ${invoice.providerReference}: ${mismatch}`);
      return this.finish(row, 'manual_review', mismatch, report?.id);
    }

    const paidAt = new Date();
    // Si el dueño pagó por el enlace de Cobrix nunca reportó nada de nuestro
    // lado. El reporte se crea igual: es el registro que audita SUB-6 y lo que
    // hace idempotente la extensión del período.
    const report =
      (await this.findReport(invoice)) ??
      (await this.createReportFor(invoice, event, paidAt));

    const subscription = await this.payments.verifyFromGateway(report, {
      gatewayPaymentId: event.paymentId,
      at: paidAt,
    });
    if (!subscription) {
      const reason = 'El tenant no tiene suscripción: no hay nada que activar.';
      await this.payments.flagForManualReview(report, 'rejected', reason, {
        gatewayPaymentId: event.paymentId,
      });
      return this.finish(row, 'manual_review', reason, report.id);
    }

    invoice.status = 'paid';
    invoice.paidAt = paidAt;
    if (event.invoiceId) invoice.providerInvoiceId = event.invoiceId;
    await this.invoices.save(invoice);

    this.logger.log(
      `[cobrix] ${invoice.providerReference} cobrado: reporte ${report.id} verificado, suscripción ${subscription.id} vigente hasta ${
        subscription.currentPeriodEnd?.toISOString() ?? '—'
      }`,
    );
    return this.finish(
      row,
      'verified',
      `Cobro confirmado por Cobrix (${event.paymentId ?? 'sin id de pago'}).`,
      report.id,
    );
  }

  // ---------------------------------------------------------------------------
  // Canal general: solo avisa que el dueño ya reportó su pago
  // ---------------------------------------------------------------------------

  /**
   * `checkout.session.completed`. NO confirma el cobro —eso lo hace
   * `invoice.paid`—, solo distingue "abrió el cobro" de "ya pagó y está
   * esperando", que es lo que la app necesita para no pedirle pagar a alguien
   * que ya pagó.
   */
  async handleGeneralWebhook(
    rawBody: Buffer | undefined,
    headers: SignatureHeaders,
  ): Promise<CobrixAck> {
    if (!rawBody?.length)
      throw new BadRequestException('Webhook de Cobrix sin cuerpo.');

    this.assertSigned(
      verifyCobrixSignature(rawBody, headers, {
        secret: this.cobrix.generalWebhookSecret,
        toleranceSeconds: this.cobrix.toleranceSeconds,
      }),
      'general',
    );

    const payload = this.parseJson(rawBody);
    const eventType = eventNameOf(payload) ?? 'desconocido';

    // La referencia viaja INCRUSTADA dentro de otro identificador (medido:
    // `data.documents[0].invoiceNumber = "clyps:clyps-7-1788372343"`), así que
    // se busca el patrón en todo el cuerpo en vez de adivinar una ruta.
    const providerReference = findProviderReference(
      payload,
      this.cobrix.provider,
    );

    const row = await this.record(
      'general',
      // Este canal sí trae id de evento propio.
      eventIdOf(payload) ??
        `${eventType}:${providerReference ?? 'sin-referencia'}`,
      eventType,
      { providerReference, payload },
    );
    if (!row) return { received: true, outcome: 'duplicate' };

    if (!CHECKOUT_COMPLETED_EVENTS.has(eventType))
      return this.finish(
        row,
        'ignored',
        `El evento ${eventType} no mueve nada aquí.`,
      );

    if (!providerReference)
      return this.finish(
        row,
        'unmatched',
        'El evento no trae nuestra referencia.',
      );

    const invoice = await this.invoices.findOne({
      where: { providerReference },
    });
    if (!invoice)
      return this.finish(
        row,
        'unmatched',
        `No hay factura con la referencia ${providerReference}.`,
      );

    row.invoiceId = invoice.id;
    this.logger.log(
      `[cobrix] ${providerReference}: el dueño reportó su pago, esperando conciliación`,
    );
    return this.finish(
      row,
      'ignored',
      'El dueño terminó el checkout; falta la conciliación.',
    );
  }

  // ---------------------------------------------------------------------------
  // Seguridad
  // ---------------------------------------------------------------------------

  /** Un webhook que no viene firmado por Cobrix se descarta y se registra. */
  private assertSigned(check: SignatureCheck, channel: string): void {
    if (check.ok) return;

    if (check.reason === 'no_secret') {
      // No es culpa de Cobrix: falta configurar el secreto de este lado. 503
      // para que reintente, porque este evento sí se podrá procesar después.
      this.logger.error(
        `[cobrix] Llega un webhook del canal ${channel} y su secreto no está configurado: se descarta.`,
      );
      throw new ServiceUnavailableException(
        'La verificación automática no está configurada.',
      );
    }

    // Se deja constancia de que ALGO llegó: sin esto, un secreto mal puesto y
    // un endpoint sin registrar se ven igual desde el log —los dos son
    // silencio— y no hay forma de saber cuál hay que arreglar.
    this.logger.warn(
      `[cobrix] Webhook del canal ${channel} DESCARTADO por firma inválida (${check.reason}).`,
    );
    throw new UnauthorizedException('Firma inválida.');
  }

  private parseJson(rawBody: Buffer): unknown {
    try {
      return JSON.parse(rawBody.toString('utf8'));
    } catch {
      throw new BadRequestException(
        'El webhook de Cobrix no trae JSON válido.',
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Idempotencia
  // ---------------------------------------------------------------------------

  /**
   * Deja constancia del evento ANTES de actuar. Devuelve `null` si ese id ya
   * estaba registrado: es un reintento de Cobrix y no debe volver a extender
   * nada.
   *
   * El candado real es el índice único (provider, event_id), no una consulta
   * previa: dos entregas simultáneas del mismo evento la pasan las dos, pero
   * solo una gana el insert.
   */
  private async record(
    channel: GatewayEventChannel,
    eventId: string,
    eventType: string,
    extra: { providerReference: string | null; payload: unknown },
  ): Promise<PaymentGatewayEvent | null> {
    try {
      return await this.events.save(
        this.events.create({
          provider: PROVIDER,
          channel,
          eventId: eventId.slice(0, 160),
          eventType: eventType.slice(0, 60),
          providerReference: extra.providerReference,
          outcome: 'received',
          payload: extra.payload,
          receivedAt: new Date(),
        }),
      );
    } catch (error) {
      if (this.isDuplicate(error)) {
        this.logger.log(`[cobrix] Evento ${eventId} repetido: ya procesado.`);
        return null;
      }
      throw error;
    }
  }

  private isDuplicate(error: unknown): boolean {
    return (
      error instanceof QueryFailedError &&
      (error.message.includes('UQ_payment_gateway_event') ||
        error.message.includes('ER_DUP_ENTRY') ||
        error.message.includes('Duplicate entry'))
    );
  }

  // ---------------------------------------------------------------------------
  // Casamiento y decisión
  // ---------------------------------------------------------------------------

  /** El reporte que el dueño hizo contra esta factura, si lo hizo. */
  private async findReport(
    invoice: SubscriptionInvoice,
  ): Promise<PaymentReport | null> {
    return this.reports.findOne({
      where: { invoiceId: invoice.id, status: 'reported' },
      order: { id: 'DESC' },
    });
  }

  /**
   * Crea el reporte del pago que Cobrix cobró sin que el dueño reportara nada
   * (pagó por el enlace).
   *
   * Nace en `reported` y lo verifica el mismo camino de siempre: así el registro
   * de auditoría, la idempotencia de SUB-6 y la cola del admin funcionan igual
   * venga de donde venga el pago.
   */
  private async createReportFor(
    invoice: SubscriptionInvoice,
    event: CobrixInvoiceEvent,
    paidAt: Date,
  ): Promise<PaymentReport> {
    const isVes = invoice.currency === CURRENCY_VES;
    return this.reports.save(
      this.reports.create({
        companyId: invoice.companyId,
        subscriptionId: invoice.subscriptionId,
        planId: invoice.planId,
        method: 'pago_movil',
        amountVesMinor: isVes ? invoice.amountMinor : null,
        amountUsdMinor: isVes ? null : invoice.amountMinor,
        currency: invoice.currency,
        frozenRate: invoice.frozenRate,
        quotedAt: invoice.quotedAt,
        // La referencia del pago según Cobrix. Si no viene, la de la factura:
        // el índice único por company exige que haya una y sea estable.
        reference: (event.paymentId ?? invoice.providerReference)
          .toUpperCase()
          .slice(0, 64),
        note: 'Cobrado a través de Cobrix',
        reportedAt: paidAt,
        status: 'reported',
        autoCheckStatus: 'pending',
        autoCheckAt: paidAt,
        invoiceId: invoice.id,
        payerIdentification: invoice.payerIdentification,
      }),
    );
  }

  /**
   * ¿Se cobró lo que se facturó?
   *
   * ⚠️ La comparación SOLO vale si el evento habla de la MISMA moneda que la
   * factura. Si se facturó en Bs y el evento trae el monto convertido a otra
   * moneda, comparar los números mandaría a revisión manual justo los pagos que
   * esta integración existe para automatizar: cuando difieren, quien decide que
   * la factura quedó saldada es Cobrix, que es el que aplicó la tasa.
   */
  private amountMismatch(
    invoice: SubscriptionInvoice,
    event: CobrixInvoiceEvent,
  ): string | null {
    if (event.amount === null) return null;
    if (
      event.currency &&
      event.currency.toUpperCase() !== invoice.currency.toUpperCase()
    )
      return null;

    const expected = invoice.amountMinor / 100;
    if (Math.abs(event.amount - expected) <= 0.01) return null;

    return `Se facturaron ${expected.toFixed(2)} ${invoice.currency} y el evento trae ${event.amount}.`;
  }

  /** Cierra la fila de auditoría con lo que se decidió. */
  private async finish(
    row: PaymentGatewayEvent,
    outcome: GatewayEventOutcome,
    detail: string,
    paymentReportId?: number,
  ): Promise<CobrixAck> {
    row.outcome = outcome;
    row.detail = detail.slice(0, 255);
    row.paymentReportId = paymentReportId ?? null;
    row.processedAt = new Date();
    await this.events.save(row);

    if (outcome === 'unmatched')
      this.logger.warn(`[cobrix] Webhook sin casar: ${detail}`);

    return { received: true, outcome };
  }
}
