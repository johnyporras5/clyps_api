import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Repository } from 'typeorm';
import type { Company } from '../../company/entities/company.entity';
import { SubscriptionInvoice } from '../entities/subscription-invoice.entity';
import type { PaymentReport } from '../entities/payment-report.entity';
import type { Subscription } from '../entities/subscription.entity';
import type { ExchangeRateService } from '../rate/exchange-rate.service';
import type { CobrixClient } from './cobrix.client';
import { CobrixConfig } from './cobrix.config';
import { CobrixInvoiceService } from './cobrix-invoice.service';
import type { SubscriptionService } from '../subscription.service';

/**
 * La emisión del documento de cobro (SUB-10).
 *
 * Lo que se prueba es que no se emitan cobros de más: pulsar el botón dos veces
 * no puede facturarle dos meses al mismo salón, y una factura vieja con la
 * cédula equivocada no puede reutilizarse en silencio.
 */

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

function buildService(
  options: {
    live?: SubscriptionInvoice | null;
    company?: Partial<Company> | null;
    subscription?: Partial<Subscription> | null;
    /** Un pago suyo esperando verificación. */
    pendingReport?: PaymentReport | null;
    lastIdentification?: string | null;
    configured?: boolean;
    /** Qué contesta Cobrix al anular. `false` = la factura sigue viva allá. */
    cancelOk?: boolean;
    testAmount?: string;
    testCompanyIds?: string;
  } = {},
) {
  // `findOne` sirve a dos consultas distintas y el orden importa: primero la
  // última identificación usada, después la factura viva. Se despacha por la
  // forma del `where` en vez de por el orden de las llamadas.
  const lastUsed = options.lastIdentification
    ? invoiceFixture({ payerIdentification: options.lastIdentification })
    : null;
  const invoices = {
    findOne: jest
      .fn()
      .mockImplementation((opts: { where?: { status?: string } }) =>
        Promise.resolve(
          opts?.where?.status === 'open'
            ? (options.live ?? null)
            : (options.live ?? lastUsed),
        ),
      ),
    save: jest
      .fn()
      .mockImplementation((entity: SubscriptionInvoice) =>
        Object.assign(entity, { id: entity.id ?? 9 }),
      ),
    create: jest
      .fn()
      .mockImplementation((draft: Partial<SubscriptionInvoice>) =>
        Object.assign(new SubscriptionInvoice(), draft),
      ),
    update: jest.fn().mockResolvedValue({ affected: 0 }),
  };
  const subscriptions = {
    findOne: jest
      .fn()
      .mockResolvedValue(
        options.subscription === undefined
          ? { id: 3, planId: 'full' }
          : options.subscription,
      ),
  };
  const reports = {
    findOne: jest.fn().mockResolvedValue(options.pendingReport ?? null),
  };
  const companies = {
    findOne: jest
      .fn()
      .mockResolvedValue(
        options.company === undefined
          ? { id: 7, name: 'Salón Bella', email: 'salon@example.com' }
          : options.company,
      ),
  };

  const rates = {
    fetchRate: jest.fn().mockResolvedValue({
      rate: 794.9917,
      type: 'oficial',
      source: 'dolarapi',
      sourceLabel: 'DolarAPI',
      fetchedAt: new Date('2026-09-03T12:00:00.000Z'),
    }),
  };

  const client = {
    createInvoice: jest.fn().mockResolvedValue({
      invoiceId: 'inv_nueva',
      paymentLink: 'https://pay.cobrix.co/nueva',
      raw: {},
    }),
    // Devuelve si Cobrix confirmó la anulación. `false` = quedó viva allá.
    cancelInvoice: jest.fn().mockResolvedValue(options.cancelOk ?? true),
  };

  const config = new CobrixConfig({
    get: (key: string) => {
      if (options.configured === false) return undefined;
      if (key === 'COBRIX_API_KEY') return 'cbx_live_prueba';
      if (key === 'COBRIX_WEBHOOK_SECRET') return 'whsec_prueba';
      if (key === 'COBRIX_PROVIDER') return 'clyps';
      if (key === 'COBRIX_TEST_AMOUNT') return options.testAmount;
      if (key === 'COBRIX_TEST_COMPANY_IDS') return options.testCompanyIds;
      return undefined;
    },
  } as unknown as ConfigService);

  const service = new CobrixInvoiceService(
    invoices as unknown as Repository<SubscriptionInvoice>,
    subscriptions as unknown as Repository<Subscription>,
    reports as unknown as Repository<PaymentReport>,
    companies as unknown as Repository<Company>,
    rates as unknown as ExchangeRateService,
    client as unknown as CobrixClient,
    config,
    // La suscripción se pide por aquí: si el salón no tiene, se le abre la
    // prueba en vez de negarle el cobro (CLYP-332).
    {
      ensureSubscription: jest
        .fn()
        .mockImplementation(
          () => subscriptions.findOne() as Promise<Subscription>,
        ),
    } as unknown as SubscriptionService,
  );

  return { service, invoices, client, rates };
}

/**
 * Ya pagó: no se le vuelve a abrir el cobro (CLYP-343).
 *
 * Frena UNA sola cosa: un pago esperando verificación. Su factura sigue abierta,
 * así que el segundo "Pagar ahora" devolvería el mismo documento y el mismo
 * enlace — pagaría dos veces lo mismo y el segundo pago no quedaría registrado.
 *
 * Tener un mes pagado corriendo NO frena: pagar por adelantado es legítimo y el
 * mes se encadena al que ya tiene. Un pago RECHAZADO tampoco frena — ese es
 * justo el caso en que hay que dejarlo pagar otra vez.
 */
describe('el candado del que ya pagó', () => {
  it('con un pago esperando verificación no se emite otro cobro', async () => {
    const { service, client } = buildService({
      pendingReport: { id: 4, status: 'reported' } as PaymentReport,
    });

    await expect(service.startCheckout(7)).rejects.toThrow(
      /pago tuyo en revisión/,
    );
    // Y no se molesta a Cobrix: la factura ni se intenta.
    expect(client.createInvoice).not.toHaveBeenCalled();
  });

  it('con el mes pagado corriendo SÍ se le emite: paga por adelantado', async () => {
    const { service } = buildService({
      subscription: {
        id: 3,
        planId: 'basico',
        currentPeriodEnd: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
      } as Subscription,
      lastIdentification: 'J401234567',
    });

    await expect(service.startCheckout(7)).resolves.toMatchObject({
      reused: false,
    });
  });

  it('adelantarse con un pago en revisión sigue frenado, aunque el mes esté vivo', async () => {
    const { service, client } = buildService({
      subscription: {
        id: 3,
        planId: 'basico',
        currentPeriodEnd: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
      } as Subscription,
      pendingReport: { id: 9, status: 'reported' } as PaymentReport,
    });

    await expect(service.startCheckout(7)).rejects.toThrow(
      /pago tuyo en revisión/,
    );
    expect(client.createInvoice).not.toHaveBeenCalled();
  });

  it('con el mes vencido sí se le emite: es su renovación', async () => {
    const { service } = buildService({
      subscription: {
        id: 3,
        planId: 'basico',
        currentPeriodEnd: new Date(Date.now() - 24 * 60 * 60 * 1000),
      } as Subscription,
      lastIdentification: 'J401234567',
    });

    await expect(service.startCheckout(7)).resolves.toMatchObject({
      reused: false,
    });
  });
});

/** El primer argumento con el que se llamó al mock. */
function firstArg<T>(mock: jest.Mock): T {
  const calls = mock.mock.calls as unknown as unknown[][];
  return calls[0]?.[0] as T;
}

describe('emisión del documento de cobro', () => {
  it('emite la factura en Bs y guarda la referencia que casa el webhook', async () => {
    const { service, client, invoices } = buildService();

    const result = await service.startCheckout(7, {
      identification: 'J401234567',
    });

    expect(result.reused).toBe(false);
    expect(result.currency).toBe('VES');
    expect(result.paymentLink).toBe('https://pay.cobrix.co/nueva');
    // La referencia lleva el prefijo del proveedor y la company: es el patrón
    // que el canal general busca dentro del payload.
    expect(result.providerReference).toMatch(/^clyps-7-\d+$/);

    // A Cobrix se le manda el monto en unidades MAYORES: su API pública no
    // lleva campo de moneda y factura en la moneda de la cuenta.
    const sent = firstArg<{ amount: number }>(client.createInvoice);
    const saved = firstArg<SubscriptionInvoice>(invoices.save);
    expect(sent.amount).toBeCloseTo(saved.amountMinor / 100, 2);
    expect(saved.status).toBe('open');
    expect(saved.frozenRate).toBe(794.9917);
  });

  it('reutiliza la factura viva: dos toques al botón no facturan dos meses', async () => {
    const live = invoiceFixture();
    const { service, client } = buildService({ live });

    const result = await service.startCheckout(7, {});

    expect(result.reused).toBe(true);
    expect(result.providerReference).toBe(live.providerReference);
    expect(client.createInvoice).not.toHaveBeenCalled();
  });

  it('reemplaza la factura viva si el dueño corrige su cédula', async () => {
    const live = invoiceFixture({ payerIdentification: 'V12345678' });
    const { service, client, invoices } = buildService({ live });

    const result = await service.startCheckout(7, {
      identification: 'J401234567',
    });

    expect(result.reused).toBe(false);
    // La vieja se cierra: lleva la cédula equivocada y Cobrix no la deja editar.
    const replaced = firstArg<SubscriptionInvoice>(invoices.save);
    expect(replaced.status).toBe('replaced');
    expect(client.createInvoice).toHaveBeenCalledTimes(1);
  });

  it('reutiliza la cédula guardada: solo se pide la primera vez', async () => {
    const { service, client } = buildService({
      lastIdentification: 'J401234567',
    });

    await service.startCheckout(7, {});

    const sent = firstArg<{ identification: string }>(client.createInvoice);
    // Sale normalizada aunque se haya guardado de otra forma: a Cobrix siempre
    // le llega la misma identidad, no una por cada manera de escribirla.
    expect(sent.identification).toBe('J-401234567');
  });

  it('normaliza lo que escribe el dueño antes de mandarlo', async () => {
    const { service, client } = buildService({ lastIdentification: null });

    await service.startCheckout(7, { identification: 'v 12.345.678' });

    const sent = firstArg<{ identification: string }>(client.createInvoice);
    expect(sent.identification).toBe('V-12345678');
  });

  /**
   * Sin letra no se adivina: `12345678` puede ser la cédula V-12345678 o el RIF
   * J-12345678, y elegir por él le factura a otra persona.
   */
  it('una cédula sin letra se rechaza, no se completa a mano', async () => {
    const { service, client } = buildService({ lastIdentification: null });

    await expect(
      service.startCheckout(7, { identification: '12345678' }),
    ).rejects.toThrow(/con su letra/);
    expect(client.createInvoice).not.toHaveBeenCalled();
  });

  it('una guardada sin letra cuenta como no tenerla: se vuelve a pedir', async () => {
    const { service, client } = buildService({
      lastIdentification: '1234567',
    });

    await expect(service.startCheckout(7, {})).rejects.toThrow(
      /cédula o RIF para emitir/,
    );
    expect(client.createInvoice).not.toHaveBeenCalled();
  });

  it('sin cédula y sin ninguna guardada, la pide', async () => {
    const { service } = buildService({ lastIdentification: null });

    await expect(service.startCheckout(7, {})).rejects.toThrow(
      BadRequestException,
    );
  });

  it('sin correo del salón no se puede emitir: Cobrix lo exige', async () => {
    const { service } = buildService({
      company: { id: 7, name: 'Salón Bella', email: '' },
    });

    await expect(
      service.startCheckout(7, { identification: 'J401234567' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('el andamio de pruebas factura el monto simbólico, no el del plan', async () => {
    const { service, client } = buildService({ testAmount: '1' });

    await service.startCheckout(7, { identification: 'J401234567' });

    // 1 Bs, no los ~22.000 que vale el plan.
    expect(firstArg<{ amount: number }>(client.createInvoice).amount).toBe(1);
  });

  it('el andamio solo aplica a los salones indicados', async () => {
    // La red que protege a los tenants reales si la variable se queda puesta.
    const { service, client } = buildService({
      testAmount: '1',
      testCompanyIds: '99',
    });

    await service.startCheckout(7, { identification: 'J401234567' });

    expect(
      firstArg<{ amount: number }>(client.createInvoice).amount,
    ).toBeGreaterThan(1);
  });

  it('sin Cobrix configurado no emite nada y lo dice', async () => {
    const { service, client } = buildService({ configured: false });

    await expect(
      service.startCheckout(7, { identification: 'J401234567' }),
    ).rejects.toThrow(ServiceUnavailableException);
    expect(client.createInvoice).not.toHaveBeenCalled();
  });
});

/**
 * Soltar el documento de cobro cuando el pago se rechaza (CLYP-342).
 *
 * Las dos mitades importan: cerrar la factura aquí es lo que deja emitir otra,
 * y anularla en Cobrix es lo que evita que el dueño vea dos deudas del mismo
 * mes y pague la muerta.
 */
describe('soltar la factura', () => {
  it('la anula en Cobrix y la cierra de nuestro lado', async () => {
    const { service, client, invoices } = buildService();
    const invoice = invoiceFixture({ providerInvoiceId: 'inv_abc' });

    const canceled = await service.release(invoice, 'El pago no entró.');

    expect(canceled).toBe(true);
    expect(client.cancelInvoice).toHaveBeenCalledWith('inv_abc');
    // Cerrada: `findLive` deja de devolverla y el próximo checkout emite otra.
    expect(invoice.status).toBe('expired');
    expect(invoices.save).toHaveBeenCalledTimes(1);
  });

  it('si Cobrix no anula, la cierra igual: el dueño tiene que poder pagar', async () => {
    const { service, invoices } = buildService({ cancelOk: false });
    const invoice = invoiceFixture({ providerInvoiceId: 'inv_abc' });

    const canceled = await service.release(invoice, 'El pago no entró.');

    // Devuelve false para que quede el aviso, pero NO aborta: dejarla abierta
    // de nuestro lado trabaría al dueño en un enlace muerto.
    expect(canceled).toBe(false);
    expect(invoice.status).toBe('expired');
    expect(invoices.save).toHaveBeenCalledTimes(1);
  });

  it('sin id de Cobrix no llama a su API, pero cierra la nuestra', async () => {
    const { service, client } = buildService();
    const invoice = invoiceFixture({ providerInvoiceId: null });

    const canceled = await service.release(invoice, 'El pago no entró.');

    expect(client.cancelInvoice).not.toHaveBeenCalled();
    expect(canceled).toBe(false);
    expect(invoice.status).toBe('expired');
  });

  it('una factura ya cobrada no se toca', async () => {
    const { service, client, invoices } = buildService();
    const invoice = invoiceFixture({ status: 'paid' });

    await service.release(invoice, 'El pago no entró.');

    expect(client.cancelInvoice).not.toHaveBeenCalled();
    expect(invoices.save).not.toHaveBeenCalled();
    expect(invoice.status).toBe('paid');
  });
});
