import {
  quoteAmountVesMinor,
  quoteValidUntil,
  validateFrozenQuote,
  type FrozenQuote,
} from './subscription-quote.util';

const RULES = { ttlHours: 3, toleranceBps: 500 };

describe('quoteAmountVesMinor', () => {
  it('cotiza el plan a la tasa dada', () => {
    // Básico $15.00 a 36.50 = 547.50 Bs
    expect(quoteAmountVesMinor('basico', 36.5)).toBe(54750);
    // Full $28.00 a 36.50 = 1022.00 Bs
    expect(quoteAmountVesMinor('full', 36.5)).toBe(102200);
  });
});

describe('quoteValidUntil', () => {
  it('abre una ventana corta desde el momento de cotizar', () => {
    const quotedAt = new Date('2026-08-31T10:00:00.000Z');
    expect(quoteValidUntil(quotedAt, 3).toISOString()).toBe(
      '2026-08-31T13:00:00.000Z',
    );
  });
});

describe('validateFrozenQuote', () => {
  const now = new Date('2026-08-31T12:00:00.000Z');
  const valid: FrozenQuote = {
    planId: 'basico',
    frozenRate: 36.5,
    amountVesMinor: 54750,
    quotedAt: new Date('2026-08-31T11:00:00.000Z'),
  };

  it('acepta la cotización recién entregada', () => {
    expect(validateFrozenQuote(valid, 36.5, RULES, now)).toEqual({ ok: true });
  });

  it('tolera que la tasa se mueva dentro de la banda', () => {
    // 36.5 → 37.2 es ~1.9%, por debajo del 5% permitido.
    expect(validateFrozenQuote(valid, 37.2, RULES, now)).toEqual({ ok: true });
  });

  it('rechaza una cotización vieja: hay que recotizar', () => {
    const old = { ...valid, quotedAt: new Date('2026-08-31T05:00:00.000Z') };
    expect(validateFrozenQuote(old, 36.5, RULES, now)).toMatchObject({
      ok: false,
      reason: 'expired',
    });
  });

  it('rechaza una cotización con fecha del futuro', () => {
    const future = { ...valid, quotedAt: new Date('2026-08-31T13:00:00.000Z') };
    expect(validateFrozenQuote(future, 36.5, RULES, now)).toMatchObject({
      ok: false,
      reason: 'expired',
    });
  });

  it('rechaza el monto manipulado aunque la tasa sea la de hoy', () => {
    const tampered = { ...valid, amountVesMinor: 100 };
    expect(validateFrozenQuote(tampered, 36.5, RULES, now)).toMatchObject({
      ok: false,
      reason: 'amount_mismatch',
    });
  });

  it('rechaza la tasa manipulada: el monto ya no cuadra con el plan', () => {
    const tampered = { ...valid, frozenRate: 1 };
    expect(validateFrozenQuote(tampered, 36.5, RULES, now)).toMatchObject({
      ok: false,
      reason: 'amount_mismatch',
    });
  });

  it('rechaza cuando la tasa se movió más de la tolerancia', () => {
    // Cotizó a 36.5 y hoy está en 50: 37% de diferencia.
    expect(validateFrozenQuote(valid, 50, RULES, now)).toMatchObject({
      ok: false,
      reason: 'rate_out_of_band',
    });
  });

  it('rechaza una tasa congelada no positiva', () => {
    const broken = { ...valid, frozenRate: 0, amountVesMinor: 0 };
    expect(validateFrozenQuote(broken, 36.5, RULES, now)).toMatchObject({
      ok: false,
      reason: 'rate_out_of_band',
    });
  });
});
