import {
  DEFAULT_BF2026_WINDOW,
  OFFERS,
  PROMO_UPGRADE,
} from './config/offers.config';
import { PLANS } from './config/plans.config';
import {
  availableOffers,
  isWindowOpen,
  offerBlockReason,
  resolveOfferWindow,
  upgradeBlockReason,
  type OfferContext,
  type UpgradeContext,
} from './offers.util';

const W = DEFAULT_BF2026_WINDOW;
const at = (iso: string) => new Date(iso);

describe('catálogo de ofertas', () => {
  it('precios acordados: Básico 3m $30, Full 3m $60, mejora $30', () => {
    expect(OFFERS.bf2026_basico).toMatchObject({
      planId: 'basico',
      months: 3,
      priceUsdMinor: 3000,
    });
    expect(OFFERS.bf2026_full).toMatchObject({
      planId: 'full',
      months: 3,
      priceUsdMinor: 6000,
    });
    expect(PROMO_UPGRADE.priceUsdMinor).toBe(3000);
  });

  it('el "antes" es de verdad 3 meses al precio normal (si cambia un plan, esto avisa)', () => {
    for (const offer of Object.values(OFFERS))
      expect(offer.regularUsdMinor).toBe(
        PLANS[offer.planId].priceUsdMinor * offer.months,
      );
  });

  it('cada oferta es más barata que su precio normal', () => {
    for (const offer of Object.values(OFFERS))
      expect(offer.priceUsdMinor).toBeLessThan(offer.regularUsdMinor);
  });
});

describe('ventana', () => {
  it('por defecto: del 23/11 al 04/12 incluido en hora de Caracas (12 días)', () => {
    expect(isWindowOpen(W, at('2026-11-23T03:59:59Z'))).toBe(false); // 22/11 23:59 VET
    expect(isWindowOpen(W, at('2026-11-23T04:00:00Z'))).toBe(true); // 23/11 00:00 VET
    expect(isWindowOpen(W, at('2026-11-27T15:00:00Z'))).toBe(true); // Black Friday
    expect(isWindowOpen(W, at('2026-12-05T03:59:59Z'))).toBe(true); // 04/12 23:59 VET
    expect(isWindowOpen(W, at('2026-12-05T04:00:00Z'))).toBe(false); // 05/12 00:00 VET
    expect(W.end.getTime() - W.start.getTime()).toBe(12 * 24 * 60 * 60 * 1000);
  });

  it('se mueve por variable de entorno (p. ej. cortarla antes)', () => {
    const { window, warnings } = resolveOfferWindow({
      start: '2026-11-27T00:00:00-04:00',
      end: '2026-12-01T00:00:00-04:00',
    });
    expect(warnings).toEqual([]);
    expect(isWindowOpen(window, at('2026-11-30T20:00:00Z'))).toBe(true);
    expect(isWindowOpen(window, at('2026-12-02T15:00:00Z'))).toBe(false);
  });

  it('un valor mal escrito no abre la promo: usa el de por defecto y avisa', () => {
    const { window, warnings } = resolveOfferWindow({
      start: 'mañana',
      end: '',
    });
    expect(window).toEqual(W);
    expect(warnings).toHaveLength(1);
  });

  it('fin antes del inicio: ignora ambas', () => {
    const { window, warnings } = resolveOfferWindow({
      start: '2026-12-10T00:00:00Z',
      end: '2026-12-01T00:00:00Z',
    });
    expect(window).toEqual(W);
    expect(warnings).toHaveLength(1);
  });
});

describe('quién puede tomar la oferta', () => {
  const base: OfferContext = {
    now: at('2026-11-27T15:00:00Z'),
    window: W,
    billingExempt: false,
    campaignTaken: false,
  };

  it('cualquier salón que paga, dentro de la ventana: ve las dos', () => {
    expect(offerBlockReason(base)).toBeNull();
    expect(availableOffers(base).map((o) => o.id)).toEqual([
      'bf2026_basico',
      'bf2026_full',
    ]);
  });

  it('fuera de la ventana no ve nada', () => {
    expect(offerBlockReason({ ...base, now: at('2026-11-22T15:00:00Z') })).toBe(
      'window_closed',
    );
    expect(
      availableOffers({ ...base, now: at('2026-12-05T15:00:00Z') }),
    ).toEqual([]);
  });

  it('VIP no', () => {
    expect(offerBlockReason({ ...base, billingExempt: true })).toBe('vip');
  });

  it('una sola vez por salón', () => {
    expect(offerBlockReason({ ...base, campaignTaken: true })).toBe(
      'already_taken',
    );
  });
});

describe('mejora Básico → Full', () => {
  const base: UpgradeContext = {
    now: at('2026-12-10T15:00:00Z'),
    billingExempt: false,
    currentPlanId: 'basico',
    verifiedOfferId: 'bf2026_basico',
    offerCoversUntil: at('2027-02-27T04:00:00Z'),
    upgradeTaken: false,
  };

  it('con la promo Básico verificada y vigente: puede (aunque ya pasó el Black Friday)', () => {
    expect(upgradeBlockReason(base)).toBeNull();
  });

  it('sin promo Básico, o con la de Full: no', () => {
    expect(upgradeBlockReason({ ...base, verifiedOfferId: null })).toBe(
      'no_basic_promo',
    );
    expect(
      upgradeBlockReason({ ...base, verifiedOfferId: 'bf2026_full' }),
    ).toBe('no_basic_promo');
  });

  it('una sola mejora', () => {
    expect(upgradeBlockReason({ ...base, upgradeTaken: true })).toBe(
      'already_upgraded',
    );
  });

  it('si ya no está en Básico, no', () => {
    expect(upgradeBlockReason({ ...base, currentPlanId: 'full' })).toBe(
      'not_on_basic',
    );
  });

  it('terminados los 3 meses, no', () => {
    expect(
      upgradeBlockReason({ ...base, now: at('2027-02-27T04:00:00Z') }),
    ).toBe('promo_over');
    expect(upgradeBlockReason({ ...base, offerCoversUntil: null })).toBe(
      'promo_over',
    );
  });

  it('VIP no', () => {
    expect(upgradeBlockReason({ ...base, billingExempt: true })).toBe('vip');
  });
});
