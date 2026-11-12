import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { DataSource, Repository } from 'typeorm';
import { PromoService } from './promo.service';
import { SubscriptionService } from './subscription.service';
import type { PaymentReport } from './entities/payment-report.entity';
import type { Subscription } from './entities/subscription.entity';
import { amountDiscrepancy } from './payment-discrepancy.util';
import { validateFrozenQuote } from './subscription-quote.util';
import { usdMinorToVesMinor } from './subscription-money.util';

/**
 * La promo Black Friday de punta a punta, sin base de datos: qué se cobra, que
 * no se repita, cuánto tiempo da al verificarse y que la revisión del monto no
 * marque como "pago incompleto" un pago de promo bien hecho.
 */

const IN_WINDOW = new Date('2026-11-28T15:00:00Z');
const AFTER_WINDOW = new Date('2026-12-10T15:00:00Z');

function buildPromo(options: {
  sub?: Partial<Subscription> | null;
  taken?: boolean;
  verifiedBasicPromo?: Partial<PaymentReport> | null;
  upgradeTaken?: boolean;
  env?: Record<string, string>;
}) {
  const sub =
    options.sub === null
      ? null
      : ({
          id: 1,
          companyId: 7,
          planId: 'basico',
          billingExempt: false,
          ...options.sub,
        } as Subscription);
  const subscriptions = {
    findOne: jest.fn().mockResolvedValue(sub),
  } as unknown as Repository<Subscription>;
  const reports = {
    exists: jest.fn(({ where }: { where: { kind: string } }) =>
      Promise.resolve(
        where.kind === 'promo'
          ? Boolean(options.taken)
          : Boolean(options.upgradeTaken),
      ),
    ),
    findOne: jest.fn().mockResolvedValue(options.verifiedBasicPromo ?? null),
  } as unknown as Repository<PaymentReport>;
  const config = {
    get: (key: string) => options.env?.[key],
  } as unknown as ConfigService;
  return new PromoService(subscriptions, reports, config);
}

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return null;
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    return ((error as BadRequestException).getResponse() as { code: string })
      .code;
  }
};

describe('qué se cobra', () => {
  it('sin promo: el mes del plan, como siempre', async () => {
    const charge = await buildPromo({}).resolveCharge(
      7,
      { planId: 'full' },
      'quote',
      IN_WINDOW,
    );
    expect(charge).toMatchObject({
      kind: 'regular',
      planId: 'full',
      months: 1,
      priceUsdMinor: 2800,
    });
  });

  it('promo Full: $60 por 3 meses (el precio lo pone el servidor)', async () => {
    const charge = await buildPromo({}).resolveCharge(
      7,
      { offerId: 'bf2026_full' },
      'quote',
      IN_WINDOW,
    );
    expect(charge).toMatchObject({
      kind: 'promo',
      planId: 'full',
      offerId: 'bf2026_full',
      months: 3,
      priceUsdMinor: 6000,
    });
  });

  it('fuera de la semana no se cotiza la promo', async () => {
    expect(
      await code(
        buildPromo({}).resolveCharge(
          7,
          { offerId: 'bf2026_basico' },
          'quote',
          AFTER_WINDOW,
        ),
      ),
    ).toBe('PROMO_WINDOW_CLOSED');
  });

  it('pero se puede REPORTAR hasta 48 h después de cerrar (pagó el último día a las 11 p. m.)', async () => {
    const justAfter = new Date('2026-12-05T03:00:00Z'); // 04/12 23:00 VET
    const charge = await buildPromo({}).resolveCharge(
      7,
      { offerId: 'bf2026_basico' },
      'report',
      justAfter,
    );
    expect(charge.kind).toBe('promo');
  });

  it('una sola vez por salón', async () => {
    expect(
      await code(
        buildPromo({ taken: true }).resolveCharge(
          7,
          { offerId: 'bf2026_full' },
          'quote',
          IN_WINDOW,
        ),
      ),
    ).toBe('PROMO_ALREADY_TAKEN');
  });

  it('VIP no', async () => {
    expect(
      await code(
        buildPromo({ sub: { billingExempt: true } }).resolveCharge(
          7,
          { offerId: 'bf2026_full' },
          'quote',
          IN_WINDOW,
        ),
      ),
    ).toBe('PROMO_VIP');
  });

  it('pedir promo y mejora a la vez es un error', async () => {
    expect(
      await code(
        buildPromo({}).resolveCharge(
          7,
          { offerId: 'bf2026_full', upgrade: true },
          'quote',
          IN_WINDOW,
        ),
      ),
    ).toBe('PROMO_INVALID_REQUEST');
  });

  it('mejora: $30, pasa a Full y no suma meses (también después del Black Friday)', async () => {
    const promo = buildPromo({
      verifiedBasicPromo: {
        offerId: 'bf2026_basico',
        coveredTo: new Date('2027-02-27T04:00:00Z'),
      },
    });
    const charge = await promo.resolveCharge(
      7,
      { upgrade: true },
      'quote',
      AFTER_WINDOW,
    );
    expect(charge).toMatchObject({
      kind: 'promo_upgrade',
      planId: 'full',
      months: 0,
      priceUsdMinor: 3000,
    });
  });

  it('mejora sin promo Básico verificada: no', async () => {
    expect(
      await code(
        buildPromo({}).resolveCharge(
          7,
          { upgrade: true },
          'quote',
          AFTER_WINDOW,
        ),
      ),
    ).toBe('PROMO_UPGRADE_NO_BASIC_PROMO');
  });
});

describe('lo que ve la pantalla', () => {
  it('en la semana: las dos ofertas con su ahorro', async () => {
    const status = await buildPromo({}).status(7, IN_WINDOW);
    expect(status.offers.map((o) => [o.id, o.savingsUsdMinor])).toEqual([
      ['bf2026_basico', 1500],
      ['bf2026_full', 2400],
    ]);
    expect(status.upgrade).toBeNull();
  });

  it('ya la tomó: nada que ofrecer, y lo dice', async () => {
    const status = await buildPromo({ taken: true }).status(7, IN_WINDOW);
    expect(status.offers).toEqual([]);
    expect(status.taken).toBe(true);
  });
});

describe('al verificar', () => {
  function buildSubscriptionService() {
    const saved: Subscription[] = [];
    const manager = {
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn((_e: unknown, row: Subscription) => {
        saved.push({ ...row });
        return Promise.resolve(row);
      }),
      create: jest.fn((_e: unknown, row: unknown) => row),
    };
    const dataSource = {
      transaction: (cb: (m: typeof manager) => unknown) => cb(manager),
    } as unknown as DataSource;
    const service = new SubscriptionService(
      {} as Repository<Subscription>,
      dataSource,
      { emit: jest.fn() } as unknown as EventEmitter2,
    );
    return { service, saved, manager };
  }

  const now = new Date('2026-11-28T15:00:00Z');

  it('la promo suma 3 meses desde el fin de la prueba', async () => {
    const { service } = buildSubscriptionService();
    const sub = {
      id: 1,
      companyId: 7,
      planId: null,
      status: 'trialing',
      trialEndsAt: new Date('2026-12-05T15:00:00Z'),
      currentPeriodEnd: null,
    } as unknown as Subscription;
    const result = await service.advanceSubscription(
      sub,
      { id: 10, planId: 'full', kind: 'promo', months: 3 } as PaymentReport,
      now,
    );
    expect(result.currentPeriodEnd?.toISOString()).toBe(
      '2027-03-05T15:00:00.000Z',
    );
    expect(result.planId).toBe('full');
  });

  it('la mejora pasa a Full SIN mover la fecha', async () => {
    const { service, manager } = buildSubscriptionService();
    const end = new Date('2027-02-27T04:00:00Z');
    const sub = {
      id: 1,
      companyId: 7,
      planId: 'basico',
      status: 'active',
      trialEndsAt: null,
      currentPeriodEnd: end,
    } as unknown as Subscription;
    const result = await service.advanceSubscription(
      sub,
      {
        id: 11,
        planId: 'full',
        kind: 'promo_upgrade',
        months: 0,
      } as PaymentReport,
      now,
    );
    expect(result.planId).toBe('full');
    expect(result.currentPeriodEnd).toEqual(end);
    expect(manager.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: 'plan_upgraded', newPeriodEnd: end }),
    );
  });
});

describe('revisión del monto', () => {
  it('pagar $60 por la promo Full NO es un pago de más', () => {
    const d = amountDiscrepancy({
      planId: 'full',
      priceUsdMinor: 6000,
      method: 'binance',
      amountUsdMinor: 6000,
      amountVesMinor: null,
      frozenRate: null,
    });
    expect(d.matches).toBe(true);
    expect(d.expectedMinor).toBe(6000);
  });

  it('pagar $28 cuando la promo pedía $60 SÍ se marca', () => {
    const d = amountDiscrepancy({
      planId: 'full',
      priceUsdMinor: 6000,
      method: 'binance',
      amountUsdMinor: 2800,
      amountVesMinor: null,
      frozenRate: null,
    });
    expect(d.matches).toBe(false);
  });

  it('pago móvil de la promo: el monto en Bs se valida contra el precio de la promo', () => {
    const rate = 400;
    const quotedAt = new Date();
    const ok = validateFrozenQuote(
      {
        planId: 'basico',
        priceUsdMinor: 3000,
        amountVesMinor: usdMinorToVesMinor(3000, rate),
        frozenRate: rate,
        quotedAt,
      },
      rate,
      { ttlHours: 6, toleranceBps: 300 },
    );
    expect(ok.ok).toBe(true);
    // Y alguien que intenta pagar la promo con el monto de UN mes normal, no.
    const cheat = validateFrozenQuote(
      {
        planId: 'basico',
        priceUsdMinor: 3000,
        amountVesMinor: usdMinorToVesMinor(1500, rate),
        frozenRate: rate,
        quotedAt,
      },
      rate,
      { ttlHours: 6, toleranceBps: 300 },
    );
    expect(cheat.ok).toBe(false);
  });
});

describe('landing pública', () => {
  it('en la semana: las dos ofertas, sin mirar ningún salón', () => {
    const out = buildPromo({ taken: true }).publicOffers(IN_WINDOW);
    expect(out.offers.map((o) => o.priceUsdMinor)).toEqual([3000, 6000]);
  });

  it('fuera de la semana: vacío (la landing no tiene que saber las fechas)', () => {
    expect(buildPromo({}).publicOffers(AFTER_WINDOW).offers).toEqual([]);
  });
});
