import { ConflictException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { DataSource, EntityManager, Repository } from 'typeorm';
import { PaymentsService } from './payments.service';
import {
  SUBSCRIPTION_ACTIVATED,
  SubscriptionService,
} from './subscription.service';
import type { ExchangeRateService } from './rate/exchange-rate.service';
import { CobrixConfig } from './cobrix/cobrix.config';
import type { CobrixInvoiceService } from './cobrix/cobrix-invoice.service';
import type { FileUploadService } from '../common/services/file_upload.service';
import type { Company } from '../company/entities/company.entity';
import { PaymentReport } from './entities/payment-report.entity';
import { Subscription } from './entities/subscription.entity';
import type { SubscriptionEvent } from './entities/subscription-event.entity';
import type { ReportPaymentDto } from './dto/report-payment.dto';

// El servicio de archivos arrastra `uuid` (ESM puro) y jest no lo transforma.
// Aquí no se sube nada, así que se corta la dependencia con un doble vacío.
jest.mock('../common/services/file_upload.service', () => ({
  FileUploadService: class {},
}));

/**
 * Las pruebas de SUB-4 y SUB-6: verificar avanza la suscripción (una sola vez y
 * dejando rastro), rechazar no la toca, y un monto fuera de tolerancia se MARCA
 * pero no se auto-rechaza.
 *
 * Los repositorios van mockeados: lo que se prueba es la decisión, no TypeORM.
 */

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
    frozenRate: 794.9917,
    quotedAt: new Date('2026-08-31T15:40:52.291Z'),
    reference: '004512',
    payerPhone: '04141234567',
    payerBankCode: '0102',
    payerEmail: null,
    network: null,
    proofUrl: null,
    note: null,
    reportedAt: new Date('2026-08-31T16:00:00.000Z'),
    status: 'reported',
    verificationMethod: null,
    verifiedByUserId: null,
    verifiedAt: null,
    rejectionReason: null,
    ...overrides,
  });
  return report;
}

function subscriptionFixture(
  overrides: Partial<Subscription> = {},
): Subscription {
  const subscription = new Subscription();
  Object.assign(subscription, {
    id: 3,
    companyId: 7,
    planId: 'full',
    status: 'trialing',
    trialEndsAt: new Date('2026-09-05T00:00:00.000Z'),
    currentPeriodEnd: null,
    graceEndsAt: null,
    ...overrides,
  });
  return subscription;
}

interface Harness {
  service: PaymentsService;
  reports: { findOne: jest.Mock; save: jest.Mock };
  /** El repositorio de suscripciones: por aquí se abre la prueba de rescate. */
  subscriptions: { findOne: jest.Mock; save: jest.Mock; create: jest.Mock };
  /** El manager de la transacción: por aquí pasan la suscripción y su evento. */
  manager: { findOne: jest.Mock; save: jest.Mock; create: jest.Mock };
  events: { emit: jest.Mock };
}

function buildService(options: {
  report?: PaymentReport;
  subscription?: Subscription | null;
  queueRows?: PaymentReport[];
  /** Evento ya registrado para ese reporte: simula un avance previo. */
  existingEvent?: Partial<SubscriptionEvent>;
}): Harness {
  const builder = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest
      .fn()
      .mockResolvedValue([
        options.queueRows ?? [],
        options.queueRows?.length ?? 0,
      ]),
  };

  const reports = {
    findOne: jest.fn().mockResolvedValue(options.report ?? null),
    // `save` devuelve la entidad con su id, como haría TypeORM al insertar.
    save: jest.fn().mockImplementation((entity: PaymentReport) => ({
      ...entity,
      id: entity.id ?? 99,
    })),
    createQueryBuilder: jest.fn().mockReturnValue(builder),
    countBy: jest.fn().mockResolvedValue(0),
    create: jest.fn().mockImplementation((draft: PaymentReport) => draft),
  };

  const subscriptions = {
    findOne: jest.fn().mockResolvedValue(options.subscription ?? null),
    save: jest.fn().mockImplementation((entity: Subscription) => entity),
    // `ensureSubscription` crea la prueba cuando no hay fila (CLYP-332).
    create: jest
      .fn()
      .mockImplementation((draft: Partial<Subscription>) => draft),
  };

  const companies = {
    find: jest.fn().mockResolvedValue([{ id: 7, name: 'Salón Bella' }]),
  };

  // Manager de la transacción de `advanceSubscription`: ahí dentro se guardan
  // la suscripción y su evento de auditoría, juntos o ninguno.
  const manager = {
    findOne: jest.fn().mockResolvedValue(options.existingEvent ?? null),
    save: jest
      .fn()
      .mockImplementation(
        (target: unknown, entity?: unknown) => entity ?? target,
      ),
    create: jest
      .fn()
      .mockImplementation((_target: unknown, obj: unknown) => obj),
  };
  const dataSource = {
    transaction: jest
      .fn()
      .mockImplementation((run: (m: EntityManager) => Promise<unknown>) =>
        run(manager as unknown as EntityManager),
      ),
  };
  const events = { emit: jest.fn() };

  // El servicio de suscripciones va REAL: avanzar el período es justo lo que
  // se está probando.
  const subscriptionService = new SubscriptionService(
    subscriptions as unknown as Repository<Subscription>,
    dataSource as unknown as DataSource,
    events as unknown as EventEmitter2,
  );

  const service = new PaymentsService(
    subscriptions as unknown as Repository<Subscription>,
    reports as unknown as Repository<PaymentReport>,
    companies as unknown as Repository<Company>,
    {} as ExchangeRateService,
    {} as FileUploadService,
    subscriptionService,
    { get: () => undefined } as unknown as ConfigService,
    // Sin `COBRIX_API_KEY` ni `COBRIX_WEBHOOK_SECRET`: aquí se prueba el camino
    // manual de SUB-4, que es el que sigue vigente con la conciliación
    // automática apagada.
    new CobrixConfig({ get: () => undefined } as unknown as ConfigService),
    {
      findLive: jest.fn().mockResolvedValue(null),
    } as unknown as CobrixInvoiceService,
    // El mismo emisor que la suscripción: así una prueba puede mirar tanto la
    // activación (SUB-9) como el rechazo en `events.emit`.
    events as unknown as EventEmitter2,
  );

  return { service, reports, subscriptions, manager, events };
}

/** La suscripción que se mandó a guardar dentro de la transacción. */
function savedSubscription(save: jest.Mock): Subscription {
  const calls = save.mock.calls as unknown as unknown[][];
  const call = calls.find((args) => args[1] instanceof Subscription);
  return call?.[1] as Subscription;
}

/** El evento de auditoría que se registró. */
function savedEvent(save: jest.Mock): Partial<SubscriptionEvent> | undefined {
  const calls = save.mock.calls as unknown as unknown[][];
  const call = calls.find(
    (args) => (args[0] as Partial<SubscriptionEvent>)?.type !== undefined,
  );
  return call?.[0] as Partial<SubscriptionEvent> | undefined;
}

describe('verificar un pago', () => {
  it('avanza la suscripción: la activa y le da un mes', async () => {
    const { service, manager } = buildService({
      report: reportFixture(),
      subscription: subscriptionFixture({ status: 'grace' }),
    });

    const result = await service.verifyPayment(1, 42);

    expect(result.status).toBe('verified');
    expect(result.verificationMethod).toBe('manual');
    // Quién verificó sale del token del admin de plataforma.
    expect(result.verifiedByUserId).toBe(42);

    const saved = savedSubscription(manager.save);
    expect(saved.status).toBe('active');
    expect(saved.graceEndsAt).toBeNull();
    // Un mes por delante, no unos días.
    const days =
      (saved.currentPeriodEnd!.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    expect(days).toBeGreaterThan(27);
    expect(days).toBeLessThan(32);
  });

  it('deja la suscripción en el plan que se pagó', async () => {
    const { service, manager } = buildService({
      report: reportFixture({ planId: 'basico' }),
      subscription: subscriptionFixture({ planId: 'full' }),
    });

    await service.verifyPayment(1, 42);

    expect(savedSubscription(manager.save).planId).toBe('basico');
  });

  it('paga en la prueba: no pierde los días que le quedaban', async () => {
    // Día 3 de la prueba: le faltan 12 días para vencer.
    const trialEndsAt = new Date(Date.now() + 12 * 24 * 60 * 60 * 1000);
    const { service, manager } = buildService({
      report: reportFixture(),
      subscription: subscriptionFixture({
        status: 'trialing',
        trialEndsAt,
        currentPeriodEnd: null,
      }),
    });

    await service.verifyPayment(1, 42);

    // El mes pagado arranca al vencer la prueba, no hoy.
    const saved = savedSubscription(manager.save);
    expect(saved.currentPeriodEnd!.getTime()).toBeGreaterThan(
      trialEndsAt.getTime(),
    );
    const days =
      (saved.currentPeriodEnd!.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    // Los doce días de prueba MÁS el mes comprado.
    expect(days).toBeGreaterThan(39);
    // Y la fecha de la prueba se conserva: no se le recorta.
    expect(saved.trialEndsAt).toEqual(trialEndsAt);
  });

  it('encadena el mes al período vigente: pagar antes no regala días', async () => {
    const vigente = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    const { service, manager } = buildService({
      report: reportFixture(),
      subscription: subscriptionFixture({
        status: 'active',
        currentPeriodEnd: vigente,
      }),
    });

    await service.verifyPayment(1, 42);

    const saved = savedSubscription(manager.save);
    const days =
      (saved.currentPeriodEnd!.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    // Los diez días que quedaban MÁS un mes.
    expect(days).toBeGreaterThan(37);
  });

  it('deja rastro de auditoría: qué reporte extendió qué período', async () => {
    const vigente = new Date('2026-12-01T10:00:00.000Z');
    const { service, manager } = buildService({
      report: reportFixture({ id: 55 }),
      subscription: subscriptionFixture({
        status: 'grace',
        currentPeriodEnd: vigente,
      }),
    });

    await service.verifyPayment(55, 42);

    expect(savedEvent(manager.save)).toMatchObject({
      companyId: 7,
      subscriptionId: 3,
      paymentReportId: 55,
      type: 'payment_verified',
      planId: 'full',
      previousStatus: 'grace',
      newStatus: 'active',
      previousPeriodEnd: vigente,
    });
  });

  it('emite el evento de activación para SUB-9', async () => {
    const { service, events } = buildService({
      report: reportFixture({ id: 55 }),
      subscription: subscriptionFixture(),
    });

    await service.verifyPayment(55, 42);

    expect(events.emit).toHaveBeenCalledTimes(1);
    const [name, payload] = events.emit.mock.calls[0] as [string, unknown];
    expect(name).toBe(SUBSCRIPTION_ACTIVATED);
    expect(payload).toMatchObject({
      companyId: 7,
      paymentReportId: 55,
      planId: 'full',
    });
  });

  it('no se puede verificar dos veces', async () => {
    const { service, manager } = buildService({
      report: reportFixture({ status: 'verified' }),
      subscription: subscriptionFixture(),
    });

    await expect(service.verifyPayment(1, 42)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('idempotente: si el reporte ya extendió el período, no da otro mes', async () => {
    const { service, manager, events } = buildService({
      report: reportFixture(),
      subscription: subscriptionFixture(),
      // Ya hay un evento para ese reporte: el avance no debe repetirse.
      existingEvent: { id: 1, paymentReportId: 1 },
    });

    await service.verifyPayment(1, 42);

    expect(manager.save).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });
});

describe('reportar sin suscripción', () => {
  it('le abre la prueba en vez de negarle el pago', async () => {
    const { service, subscriptions, reports } = buildService({
      subscription: null,
    });

    const result = await service.reportPayment(7, {
      method: 'binance',
      amountUsdMinor: 2800,
      txId: '0xSINSUSCRIPCION',
    } as ReportPaymentDto);

    // Antes esto era un 400: el dueño quería pagar y el sistema le decía que no
    // tenía suscripción — justo lo que estaba intentando arreglar.
    expect(subscriptions.save).toHaveBeenCalledTimes(1);
    expect(subscriptions.save).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 7,
        status: 'trialing',
        planId: null,
      }),
    );
    expect(result.status).toBe('reported');
    // Sin plan elegido se cobra el de la prueba, que es el que está usando.
    expect(result.planId).toBe('full');
    expect(reports.save).toHaveBeenCalledTimes(1);
  });
});

describe('rechazar un pago', () => {
  it('NO toca la suscripción', async () => {
    const subscription = subscriptionFixture({ status: 'grace' });
    const { service, manager, events } = buildService({
      report: reportFixture(),
      subscription,
    });

    const result = await service.rejectPayment(
      1,
      { rejectionReason: 'No aparece el pago en la cuenta' },
      42,
    );

    expect(result.status).toBe('rejected');
    expect(result.rejectionReason).toBe('No aparece el pago en la cuenta');
    // Lo único que se guardó fue el reporte: la suscripción quedó como estaba.
    expect(manager.save).not.toHaveBeenCalled();
    // SUB-9: sale el aviso del rechazo, y SOLO ese. Nada de activación.
    expect(events.emit).toHaveBeenCalledTimes(1);
    expect(events.emit).toHaveBeenCalledWith(
      'subscription.payment.rejected',
      expect.objectContaining({
        companyId: 7,
        reason: 'No aparece el pago en la cuenta',
      }),
    );
    expect(subscription.status).toBe('grace');
    expect(subscription.currentPeriodEnd).toBeNull();
  });
});

describe('reportar de nuevo la misma referencia', () => {
  // Binance para que el reporte no pase por la revalidación de tasa.
  const dto = {
    method: 'binance',
    amountUsdMinor: 2800,
    txId: '0xREFERENCIA01',
  } as ReportPaymentDto;

  it('se permite si el anterior fue RECHAZADO: así se corrige un monto mal puesto', async () => {
    const { service, reports } = buildService({
      report: reportFixture({
        status: 'rejected',
        reference: '0XREFERENCIA01',
      }),
      subscription: subscriptionFixture(),
    });

    const result = await service.reportPayment(7, dto);

    expect(result.status).toBe('reported');
    expect(result.reference).toBe('0XREFERENCIA01');
    expect(reports.save).toHaveBeenCalledTimes(1);
  });

  it('se bloquea si el anterior sigue en revisión', async () => {
    const { service, reports } = buildService({
      report: reportFixture({
        status: 'reported',
        reference: '0XREFERENCIA01',
      }),
      subscription: subscriptionFixture(),
    });

    await expect(service.reportPayment(7, dto)).rejects.toThrow(
      /ya está en revisión/,
    );
    expect(reports.save).not.toHaveBeenCalled();
  });

  it('se bloquea para siempre si ya fue verificado: sería cobrar dos veces', async () => {
    const { service, reports } = buildService({
      report: reportFixture({
        status: 'verified',
        reference: '0XREFERENCIA01',
      }),
      subscription: subscriptionFixture(),
    });

    await expect(service.reportPayment(7, dto)).rejects.toThrow(
      /ya fue verificado/,
    );
    expect(reports.save).not.toHaveBeenCalled();
  });
});

describe('monto fuera de tolerancia', () => {
  it('se marca en la cola, pero el reporte sigue por verificar', async () => {
    // Reportó $15 (precio del Básico) para una suscripción Full.
    const flojo = reportFixture({
      id: 9,
      method: 'binance',
      currency: 'USD',
      amountVesMinor: null,
      amountUsdMinor: 1500,
      frozenRate: null,
      quotedAt: null,
      reference: '0XABC123',
    });
    const { service, reports } = buildService({ queueRows: [flojo] });

    const page = await service.listForAdmin({ page: 1, limit: 10 });
    const item = page.data[0];

    expect(item.discrepancy.matches).toBe(false);
    expect(item.discrepancy.expectedMinor).toBe(2800);
    expect(item.discrepancy.differenceMinor).toBe(-1300);
    // Marcar NO es rechazar: nadie tocó el reporte.
    expect(item.status).toBe('reported');
    expect(reports.save).not.toHaveBeenCalled();
  });

  it('el admin puede verificar igual un pago marcado', async () => {
    const flojo = reportFixture({
      method: 'binance',
      currency: 'USD',
      amountVesMinor: null,
      amountUsdMinor: 1500,
      frozenRate: null,
    });
    const { service, manager } = buildService({
      report: flojo,
      subscription: subscriptionFixture(),
    });

    const result = await service.verifyPayment(1, 42);

    expect(result.status).toBe('verified');
    expect(savedSubscription(manager.save).status).toBe('active');
  });
});

/**
 * SUB-FE-1 (CLYP-343): la pantalla de pago pregunta a dónde pagar.
 *
 * Lo que importa es que un método SIN datos no se ofrezca: mostrarle "Binance"
 * a alguien sin decirle a qué wallet mandar es perder su dinero y su confianza.
 */
describe('a dónde paga el dueño', () => {
  const withEnv = (env: Record<string, string>): PaymentsService => {
    const config = {
      get: (key: string) => env[key],
    } as unknown as ConfigService;
    return new PaymentsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      config,
      new CobrixConfig(config),
      {} as never,
      {} as never,
    );
  };

  it('solo ofrece los métodos que tienen datos cargados', () => {
    const result = withEnv({
      SUBSCRIPTION_PAY_PHONE: '0414-1234567',
      SUBSCRIPTION_PAY_BANK: '0102 - Banco de Venezuela',
      SUBSCRIPTION_PAY_ID: 'J-401234567',
      SUBSCRIPTION_PAY_HOLDER: 'Clyps, C.A.',
    }).getPaymentInstructions();

    expect(result.pagoMovil).toEqual({
      phone: '0414-1234567',
      bank: '0102 - Banco de Venezuela',
      identification: 'J-401234567',
      holder: 'Clyps, C.A.',
    });
    // Sin wallet ni correo, esos dos métodos no se pintan.
    expect(result.binance).toBeNull();
    expect(result.paypal).toBeNull();
  });

  it('un valor en blanco cuenta como no cargado', () => {
    const result = withEnv({
      SUBSCRIPTION_PAY_PHONE: '   ',
      SUBSCRIPTION_PAY_BINANCE_WALLET: '0xabc123',
    }).getPaymentInstructions();

    expect(result.pagoMovil).toBeNull();
    expect(result.binance).toMatchObject({ wallet: '0xabc123', network: null });
  });

  it('avisa si Cobrix está disponible', () => {
    expect(withEnv({}).getPaymentInstructions().cobrixEnabled).toBe(false);
    expect(
      withEnv({
        COBRIX_API_KEY: 'k',
        COBRIX_WEBHOOK_SECRET: 's',
      }).getPaymentInstructions().cobrixEnabled,
    ).toBe(true);
  });
});

/**
 * Cuando la pasarela dice que el pago no entró, el dueño se entera (CLYP-343).
 *
 * Medido el 2026-09-08: Cobrix rechazó el pago, el reporte quedó marcado y al
 * dueño no le llegó nada. Se enteraba el día que se le bloqueaba el acceso.
 */
describe('el aviso del pago que la pasarela rechazó', () => {
  it('avisa al dueño con el motivo, sin rechazarle el reporte', async () => {
    const report = reportFixture({ status: 'reported' });
    const { service, events } = buildService({ report });

    const saved = await service.flagForManualReview(
      report,
      'rejected',
      'Cobrix anuló la factura clyps-7-1788372343.',
    );

    // El reporte NO se cierra: eso lo decide una persona (SUB-4).
    expect(saved.status).toBe('reported');
    expect(saved.autoCheckStatus).toBe('rejected');

    const [nombre, evento] = events.emit.mock.calls[0] as [
      string,
      { reason: string; paymentReportId: number },
    ];
    expect(nombre).toBe('subscription.payment.rejected');
    expect(evento.reason).toContain('anuló');
  });

  it('lo que solo va a revisión manual no lo alarma', async () => {
    const report = reportFixture({ status: 'reported' });
    const { service, events } = buildService({ report });

    await service.flagForManualReview(
      report,
      'expired',
      'Cobrix no respondió.',
    );

    // "Todavía lo estamos revisando" no es una mala noticia que contarle.
    expect(events.emit).not.toHaveBeenCalled();
  });
});
