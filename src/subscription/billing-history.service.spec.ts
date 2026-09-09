import { NotFoundException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import { BillingHistoryService } from './billing-history.service';
import { PaymentReport } from './entities/payment-report.entity';
import { Subscription } from './entities/subscription.entity';
import type { SubscriptionService } from './subscription.service';
import type { EntitlementsService } from './entitlements.service';
import type { AccessState } from './entitlements.util';

/**
 * SUB-13 (CLYP-342): el historial del dueño.
 *
 * Lo que se prueba aquí es el AISLAMIENTO y el orden — que la consulta salga
 * siempre atada al tenant del token y que la página no dependa de la suerte del
 * motor. Los repositorios van mockeados: importa qué se le pide a la base, no
 * cómo lo resuelve.
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
    quotedAt: null,
    reference: '004512',
    payerPhone: '04141234567',
    payerBankCode: '0102',
    payerEmail: null,
    network: null,
    proofUrl: null,
    note: null,
    reportedAt: new Date('2026-09-05T16:00:00.000Z'),
    status: 'verified',
    verificationMethod: 'manual',
    verifiedByUserId: 42,
    verifiedAt: new Date('2026-09-05T18:00:00.000Z'),
    rejectionReason: null,
    autoCheckStatus: null,
    autoCheckAt: null,
    autoCheckReason: null,
    gatewayPaymentId: null,
    coveredFrom: new Date('2026-09-05T16:00:00.000Z'),
    coveredTo: new Date('2026-10-05T16:00:00.000Z'),
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
    status: 'active',
    trialEndsAt: new Date('2026-08-20T16:00:00.000Z'),
    currentPeriodEnd: new Date('2026-10-05T16:00:00.000Z'),
    graceEndsAt: null,
    billingExempt: false,
    ...overrides,
  });
  return subscription;
}

function buildService(options: {
  rows?: PaymentReport[];
  total?: number;
  found?: PaymentReport | null;
  subscription?: Subscription;
  access?: Partial<AccessState>;
}) {
  const rows = options.rows ?? [];
  const reports = {
    findAndCount: jest
      .fn()
      .mockResolvedValue([rows, options.total ?? rows.length]),
    findOne: jest.fn().mockResolvedValue(options.found ?? null),
  };
  const subscription = options.subscription ?? subscriptionFixture();
  const subscriptionService = {
    ensureSubscription: jest.fn().mockResolvedValue(subscription),
  };
  const entitlements = {
    getAccessState: jest.fn().mockResolvedValue({
      status: 'active',
      canOperate: true,
      graceCause: null,
      accessEndsAt: subscription.currentPeriodEnd,
      graceEndsAt: null,
      ...options.access,
    } as AccessState),
  };

  const service = new BillingHistoryService(
    reports as unknown as Repository<PaymentReport>,
    subscriptionService as unknown as SubscriptionService,
    entitlements as unknown as EntitlementsService,
  );

  return { service, reports, subscriptionService, entitlements };
}

describe('el listado del historial', () => {
  it('solo consulta los pagos de SU company', async () => {
    const { service, reports } = buildService({ rows: [reportFixture()] });

    await service.list(7, { page: 1, limit: 10 });

    const [args] = reports.findAndCount.mock.calls[0] as [
      { where: { companyId: number } },
    ];
    // El tenant va en el WHERE, no en un filtro posterior sobre lo ya traído.
    expect(args.where).toEqual({ companyId: 7 });
  });

  it('ordena por más reciente primero, con el id de desempate', async () => {
    const { service, reports } = buildService({ rows: [] });

    await service.list(7, { page: 1, limit: 10 });

    const [args] = reports.findAndCount.mock.calls[0] as [
      { order: Record<string, string> },
    ];
    expect(args.order).toEqual({ reportedAt: 'DESC', id: 'DESC' });
  });

  it('pagina: la página 3 salta las dos anteriores', async () => {
    const { service, reports } = buildService({ rows: [], total: 47 });

    const result = await service.list(7, { page: 3, limit: 10 });

    const [args] = reports.findAndCount.mock.calls[0] as [
      { skip: number; take: number },
    ];
    expect(args).toMatchObject({ skip: 20, take: 10 });
    expect(result.meta).toEqual({
      page: 3,
      limit: 10,
      total: 47,
      totalPages: 5,
      hasNext: true,
      hasPrev: true,
    });
  });

  it('trae los tres estados, cada uno con su ciclo', async () => {
    const { service } = buildService({
      rows: [
        reportFixture({
          id: 3,
          status: 'reported',
          coveredFrom: null,
          coveredTo: null,
        }),
        reportFixture({
          id: 2,
          status: 'rejected',
          rejectionReason: 'El monto no coincide.',
          coveredFrom: null,
          coveredTo: null,
        }),
        reportFixture({ id: 1, status: 'verified' }),
      ],
    });

    const { data } = await service.list(7, { page: 1, limit: 10 });

    expect(data.map((item) => item.status)).toEqual([
      'reported',
      'rejected',
      'verified',
    ]);
    // Solo el verificado tiene un ciclo REAL; los otros dos lo proyectan.
    expect(data.map((item) => item.cycle.estimated)).toEqual([
      true,
      true,
      false,
    ]);
    expect(data[1].rejectionReason).toBe('El monto no coincide.');
  });

  it('la cabecera dice el plan y hasta cuándo llega lo pagado', async () => {
    const { service } = buildService({
      rows: [],
      subscription: subscriptionFixture({ planId: 'basico' }),
    });

    const { subscription } = await service.list(7, { page: 1, limit: 10 });

    expect(subscription).toMatchObject({
      planId: 'basico',
      purchasedPlanId: 'basico',
      status: 'active',
      currentPeriodEnd: '2026-10-05T16:00:00.000Z',
      billingExempt: false,
    });
  });

  it('la cabecera usa el estado RECALCULADO, no la columna', async () => {
    const { service } = buildService({
      rows: [],
      // La columna dice `active`, pero el período venció y nadie corrió el cron.
      subscription: subscriptionFixture({ status: 'active' }),
      access: {
        status: 'grace',
        graceEndsAt: new Date('2026-10-10T16:00:00.000Z'),
      },
    });

    const { subscription } = await service.list(7, { page: 1, limit: 10 });

    expect(subscription.status).toBe('grace');
    expect(subscription.graceEndsAt).toBe('2026-10-10T16:00:00.000Z');
  });

  it('en la prueba el plan que USA es el Full aunque comprara el Básico', async () => {
    const { service } = buildService({
      rows: [],
      subscription: subscriptionFixture({
        planId: 'basico',
        status: 'trialing',
        trialEndsAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
        currentPeriodEnd: null,
      }),
      access: { status: 'trialing' },
    });

    const { subscription } = await service.list(7, { page: 1, limit: 10 });

    expect(subscription.planId).toBe('full');
    expect(subscription.purchasedPlanId).toBe('basico');
  });
});

describe('el detalle de un pago', () => {
  it('busca por id Y company: el pago de otro salón no existe', async () => {
    const { service, reports } = buildService({ found: null });

    await expect(service.detail(7, 999)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    const [args] = reports.findOne.mock.calls[0] as [
      { where: { id: number; companyId: number } },
    ];
    expect(args.where).toEqual({ id: 999, companyId: 7 });
  });

  it('devuelve los datos del método y el comprobante', async () => {
    const { service } = buildService({
      found: reportFixture({
        proofUrl: 'https://cdn/comprobante.jpg',
        note: 'Pagué desde otra cuenta.',
      }),
    });

    const detail = await service.detail(7, 1);

    expect(detail).toMatchObject({
      id: 1,
      payerPhone: '04141234567',
      payerBankCode: '0102',
      proofUrl: 'https://cdn/comprobante.jpg',
      note: 'Pagué desde otra cuenta.',
      verificationMethod: 'manual',
    });
    expect(detail).not.toHaveProperty('verifiedByUserId');
  });
});
