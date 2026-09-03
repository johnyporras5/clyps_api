import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { QueryFailedError, type Repository } from 'typeorm';
import { PaymentReport } from '../entities/payment-report.entity';
import { SubscriptionInvoice } from '../entities/subscription-invoice.entity';
import type { PaymentGatewayEvent } from '../entities/payment-gateway-event.entity';
import { Subscription } from '../entities/subscription.entity';
import type { PaymentsService } from '../payments.service';
import { CobrixConfig } from './cobrix.config';
import { CobrixWebhookService } from './cobrix-webhook.service';
import {
  signCobrixInvoicePayload,
  signCobrixPayload,
} from './cobrix-signature.util';

// `PaymentsService` arrastra el servicio de archivos, que a su vez arrastra
// `uuid` (ESM puro) y jest no lo transforma. Aquí no se sube nada, así que se
// corta la dependencia con un doble vacío — igual que en payments.service.spec.
jest.mock('../../common/services/file_upload.service', () => ({
  FileUploadService: class {},
}));

/**
 * Los criterios de aceptación de SUB-10, uno por prueba: cobro confirmado
 * activa, firma inválida se descarta, evento duplicado no re-extiende, y lo que
 * no cuadra va a la cola manual en vez de rechazarse solo.
 *
 * El payload es la forma REAL del canal de documentos —`event` es un OBJETO, no
 * un string— porque leerlo mal es justo el error que descarta pagos en silencio.
 */

const SECRET = 'whsec_documentos';
const GENERAL_SECRET = 'whsec_general';

function invoiceFixture(
  overrides: Partial<SubscriptionInvoice> = {},
): SubscriptionInvoice {
  const invoice = new SubscriptionInvoice();
  Object.assign(invoice, {
    id: 5,
    companyId: 7,
    subscriptionId: 3,
    planId: 'full',
    provider: 'clyps',
    providerReference: 'clyps-7-1788372343',
    providerInvoiceId: 'inv_abc',
    checkoutUrl: 'https://pay.cobrix.co/abc',
    amountMinor: 2225977,
    currency: 'VES',
    frozenRate: 794.9917,
    quotedAt: new Date('2026-08-31T15:40:52.291Z'),
    payerIdentification: 'J401234567',
    status: 'open',
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    paidAt: null,
    ...overrides,
  });
  return invoice;
}

function reportFixture(overrides: Partial<PaymentReport> = {}): PaymentReport {
  const report = new PaymentReport();
  Object.assign(report, {
    id: 1,
    companyId: 7,
    subscriptionId: 3,
    planId: 'full',
    method: 'pago_movil',
    amountVesMinor: 2225977,
    amountUsdMinor: null,
    currency: 'VES',
    reference: '004512',
    reportedAt: new Date('2026-08-31T16:00:00.000Z'),
    status: 'reported',
    verificationMethod: null,
    autoCheckStatus: 'pending',
    invoiceId: 5,
    ...overrides,
  });
  return report;
}

/** El evento del canal de documentos, con la forma medida en producción. */
function invoicePaid(
  overrides: {
    type?: string;
    providerId?: string | null;
    paymentId?: string;
    amount?: number | null;
    currency?: string;
  } = {},
) {
  return {
    event: {
      type: overrides.type ?? 'invoice.paid',
      timestamp: '2026-09-01T10:00:00.000Z',
      company_id: 'cmp_1',
      environment: 'sandbox',
    },
    invoice: {
      id: 'inv_abc',
      amount: 22259.77,
      status: 'paid',
      provider: 'clyps',
      reference: 'J401234567',
      provider_id:
        overrides.providerId === undefined
          ? 'clyps-7-1788372343'
          : overrides.providerId,
      payment: {
        id: overrides.paymentId ?? 'pay_842f7712',
        amount: overrides.amount === undefined ? 22259.77 : overrides.amount,
        currency: overrides.currency ?? 'VES',
        status: 'succeeded',
        paid_at: '2026-09-01T10:00:00.000Z',
      },
    },
  };
}

interface Harness {
  service: CobrixWebhookService;
  payments: {
    amountToleranceBps: number;
    verifyFromGateway: jest.Mock;
    flagForManualReview: jest.Mock;
  };
  reports: { findOne: jest.Mock; save: jest.Mock; create: jest.Mock };
  invoices: { findOne: jest.Mock; save: jest.Mock };
  events: { create: jest.Mock; save: jest.Mock };
  deliver: (payload: unknown) => Promise<{ outcome: string }>;
  deliverGeneral: (payload: unknown) => Promise<{ outcome: string }>;
}

function buildService(
  options: {
    invoice?: SubscriptionInvoice | null;
    report?: PaymentReport | null;
    /** Simula que ese evento ya estaba registrado (reintento de Cobrix). */
    duplicate?: boolean;
    subscription?: Subscription | null;
  } = {},
): Harness {
  const reports = {
    findOne: jest
      .fn()
      .mockResolvedValue(
        options.report === undefined ? reportFixture() : options.report,
      ),
    create: jest.fn().mockImplementation((draft: PaymentReport) => draft),
    save: jest
      .fn()
      .mockImplementation((entity: PaymentReport) =>
        Object.assign(entity, { id: entity.id ?? 42 }),
      ),
  };

  const invoices = {
    findOne: jest
      .fn()
      .mockResolvedValue(
        options.invoice === undefined ? invoiceFixture() : options.invoice,
      ),
    save: jest.fn().mockImplementation((entity: unknown) => entity),
  };

  const duplicateError = new QueryFailedError(
    'INSERT',
    [],
    new Error("Duplicate entry for key 'UQ_payment_gateway_event'"),
  );
  const events = {
    create: jest.fn().mockImplementation((row: PaymentGatewayEvent) => row),
    save: jest.fn().mockImplementation((row: PaymentGatewayEvent) => {
      if (options.duplicate && !row.id) throw duplicateError;
      return Object.assign(row, { id: row.id ?? 10 });
    }),
  };

  const subscription =
    options.subscription === undefined
      ? Object.assign(new Subscription(), {
          id: 3,
          companyId: 7,
          planId: 'full',
          status: 'active',
          currentPeriodEnd: new Date('2026-10-01T00:00:00.000Z'),
        })
      : options.subscription;

  const payments = {
    amountToleranceBps: 100,
    verifyFromGateway: jest.fn().mockResolvedValue(subscription),
    flagForManualReview: jest
      .fn()
      .mockImplementation((report: PaymentReport) => report),
  };

  const config = new CobrixConfig({
    get: (key: string) => {
      if (key === 'COBRIX_WEBHOOK_SECRET') return SECRET;
      if (key === 'COBRIX_GENERAL_WEBHOOK_SECRET') return GENERAL_SECRET;
      if (key === 'COBRIX_PROVIDER') return 'clyps';
      return undefined;
    },
  } as unknown as ConfigService);

  const service = new CobrixWebhookService(
    reports as unknown as Repository<PaymentReport>,
    invoices as unknown as Repository<SubscriptionInvoice>,
    events as unknown as Repository<PaymentGatewayEvent>,
    payments as unknown as PaymentsService,
    config,
  );

  const deliver = (payload: unknown) => {
    const body = JSON.stringify(payload);
    return service.handleInvoiceWebhook(
      Buffer.from(body, 'utf8'),
      signCobrixInvoicePayload(body, SECRET),
    );
  };

  const deliverGeneral = (payload: unknown) => {
    const body = JSON.stringify(payload);
    return service.handleGeneralWebhook(Buffer.from(body, 'utf8'), {
      signature: signCobrixPayload(
        body,
        GENERAL_SECRET,
        Math.floor(Date.now() / 1000),
      ),
    });
  };

  return {
    service,
    payments,
    reports,
    invoices,
    events,
    deliver,
    deliverGeneral,
  };
}

/** El motivo con el que se mandó el reporte a la cola manual. */
function manualReason(flag: jest.Mock): string {
  const calls = flag.mock.calls as unknown as unknown[][];
  return calls[0]?.[2] as string;
}

/** La entidad que se mandó a guardar en la primera llamada del mock. */
function firstSaved<T>(save: jest.Mock): T {
  const calls = save.mock.calls as unknown as unknown[][];
  return calls[0]?.[0] as T;
}

describe('webhook de documentos (invoice.paid)', () => {
  it('confirma el cobro: verifica el pago y dispara la activación', async () => {
    const { deliver, payments, invoices } = buildService();

    const ack = await deliver(invoicePaid());

    expect(ack).toEqual({ received: true, outcome: 'verified' });
    expect(payments.verifyFromGateway).toHaveBeenCalledTimes(1);
    const [report, options] = payments.verifyFromGateway.mock.calls[0] as [
      PaymentReport,
      { gatewayPaymentId: string },
    ];
    expect(report.id).toBe(1);
    expect(options.gatewayPaymentId).toBe('pay_842f7712');

    // La factura queda cobrada: un evento posterior ya no la mueve.
    const saved = firstSaved<SubscriptionInvoice>(invoices.save);
    expect(saved.status).toBe('paid');
    expect(saved.paidAt).toBeInstanceOf(Date);
  });

  it('crea el reporte si el dueño pagó por el enlace y nunca reportó', async () => {
    const { deliver, payments, reports } = buildService({ report: null });

    const ack = await deliver(invoicePaid());

    expect(ack.outcome).toBe('verified');
    const created = firstSaved<PaymentReport>(reports.save);
    expect(created.companyId).toBe(7);
    expect(created.invoiceId).toBe(5);
    expect(created.amountVesMinor).toBe(2225977);
    // Nace como reclamo y lo verifica el camino de siempre.
    expect(created.status).toBe('reported');
    expect(payments.verifyFromGateway).toHaveBeenCalled();
  });

  it('firma inválida: se descarta y no deja rastro de evento', async () => {
    const { service, events, payments } = buildService();
    const body = JSON.stringify(invoicePaid());

    await expect(
      service.handleInvoiceWebhook(
        Buffer.from(body, 'utf8'),
        signCobrixInvoicePayload(body, 'secreto_del_atacante'),
      ),
    ).rejects.toThrow(UnauthorizedException);

    expect(events.save).not.toHaveBeenCalled();
    expect(payments.verifyFromGateway).not.toHaveBeenCalled();
  });

  it('evento duplicado: no vuelve a verificar ni a extender', async () => {
    const { deliver, payments } = buildService({ duplicate: true });

    const ack = await deliver(invoicePaid());

    expect(ack).toEqual({ received: true, outcome: 'duplicate' });
    expect(payments.verifyFromGateway).not.toHaveBeenCalled();
  });

  it('monto distinto al facturado: va a revisión manual, no se rechaza', async () => {
    const { deliver, payments } = buildService();

    const ack = await deliver(invoicePaid({ amount: 100 }));

    expect(ack.outcome).toBe('manual_review');
    expect(payments.verifyFromGateway).not.toHaveBeenCalled();
    expect(manualReason(payments.flagForManualReview)).toContain(
      'Se facturaron',
    );
  });

  it('monto en otra moneda: la conversión la aplicó Cobrix, se confía', async () => {
    const { deliver, payments } = buildService();

    // Se facturaron 22.259,77 Bs y el evento habla de 20,25 USD: comparar los
    // números mandaría a manual justo lo que hay que automatizar.
    const ack = await deliver(invoicePaid({ amount: 20.25, currency: 'USD' }));

    expect(ack.outcome).toBe('verified');
    expect(payments.verifyFromGateway).toHaveBeenCalled();
  });

  it('la factura ya estaba cobrada: no se cobra dos veces', async () => {
    const { deliver, payments } = buildService({
      invoice: invoiceFixture({ status: 'paid' }),
    });

    const ack = await deliver(invoicePaid());

    expect(ack.outcome).toBe('already_resolved');
    expect(payments.verifyFromGateway).not.toHaveBeenCalled();
  });

  it('referencia que no es nuestra: se registra y no se toca nada', async () => {
    const { deliver, payments } = buildService({ invoice: null });

    const ack = await deliver(invoicePaid());

    expect(ack.outcome).toBe('unmatched');
    expect(payments.verifyFromGateway).not.toHaveBeenCalled();
  });

  it('evento sin provider_id: no hay forma de saber a qué cobro es', async () => {
    const { deliver, payments } = buildService();

    const ack = await deliver(invoicePaid({ providerId: null }));

    expect(ack.outcome).toBe('unmatched');
    expect(payments.verifyFromGateway).not.toHaveBeenCalled();
  });

  it('invoice.created no activa nada: la creación la pedimos nosotros', async () => {
    const { deliver, payments } = buildService();

    const ack = await deliver(invoicePaid({ type: 'invoice.created' }));

    expect(ack.outcome).toBe('ignored');
    expect(payments.verifyFromGateway).not.toHaveBeenCalled();
  });

  it('sin suscripción del tenant no hay nada que activar: va a manual', async () => {
    const { deliver, payments } = buildService({ subscription: null });

    const ack = await deliver(invoicePaid());

    expect(ack.outcome).toBe('manual_review');
    expect(manualReason(payments.flagForManualReview)).toContain(
      'no tiene suscripción',
    );
  });
});

describe('webhook del canal general', () => {
  it('encuentra nuestra referencia incrustada en otro identificador', async () => {
    const { deliverGeneral, invoices } = buildService();

    // Forma medida: la referencia viaja dentro de `invoiceNumber`.
    const ack = await deliverGeneral({
      id: 'evt_general_1',
      event: 'checkout.session.completed',
      data: { documents: [{ invoiceNumber: 'clyps:clyps-7-1788372343' }] },
    });

    expect(ack.outcome).toBe('ignored');
    expect(invoices.findOne).toHaveBeenCalledWith({
      where: { providerReference: 'clyps-7-1788372343' },
    });
  });

  it('no confirma cobros: eso solo lo hace invoice.paid', async () => {
    const { deliverGeneral, payments } = buildService();

    await deliverGeneral({
      id: 'evt_general_2',
      event: 'checkout.session.completed',
      data: { documents: [{ invoiceNumber: 'clyps:clyps-7-1788372343' }] },
    });

    expect(payments.verifyFromGateway).not.toHaveBeenCalled();
  });

  it('rechaza la firma del OTRO canal: las fórmulas no son intercambiables', async () => {
    const { service } = buildService();
    const body = JSON.stringify({
      id: 'evt_x',
      event: 'checkout.session.completed',
    });

    await expect(
      service.handleGeneralWebhook(Buffer.from(body, 'utf8'), {
        // Firma del canal de documentos (sin timestamp) contra el general.
        signature: signCobrixInvoicePayload(body, GENERAL_SECRET),
      }),
    ).rejects.toThrow(UnauthorizedException);
  });
});
