import {
  amountDiscrepancy,
  expectedAmountMinor,
  type DiscrepancyInput,
} from './payment-discrepancy.util';

// Full ($28.00) pagado en Bs a la tasa del 2026-08-31.
const PAGO_MOVIL: DiscrepancyInput = {
  planId: 'full',
  method: 'pago_movil',
  amountVesMinor: 2225977,
  amountUsdMinor: null,
  frozenRate: 794.9917,
};

const BINANCE: DiscrepancyInput = {
  planId: 'full',
  method: 'binance',
  amountVesMinor: null,
  amountUsdMinor: 2800,
  frozenRate: null,
};

describe('expectedAmountMinor', () => {
  it('en Pago Móvil usa la tasa CONGELADA, no la de hoy', () => {
    expect(expectedAmountMinor(PAGO_MOVIL)).toBe(2225977);
    // Otra tasa congelada ⇒ otro esperado, aunque el plan sea el mismo.
    expect(expectedAmountMinor({ ...PAGO_MOVIL, frozenRate: 900 })).toBe(
      2520000,
    );
  });

  it('en Binance/PayPal es el precio del plan en USD', () => {
    expect(expectedAmountMinor(BINANCE)).toBe(2800);
    expect(expectedAmountMinor({ ...BINANCE, planId: 'basico' })).toBe(1500);
  });

  it('sin tasa congelada no inventa una discrepancia', () => {
    // Un reporte viejo sin tasa: no hay contra qué comparar.
    const sinTasa = { ...PAGO_MOVIL, frozenRate: null };
    expect(expectedAmountMinor(sinTasa)).toBe(2225977);
    expect(amountDiscrepancy(sinTasa).matches).toBe(true);
  });
});

describe('amountDiscrepancy', () => {
  it('el monto exacto cuadra', () => {
    expect(amountDiscrepancy(PAGO_MOVIL)).toEqual({
      currency: 'VES',
      expectedMinor: 2225977,
      reportedMinor: 2225977,
      differenceMinor: 0,
      toleranceMinor: 22260,
      matches: true,
    });
  });

  it('tolera el redondeo del banco dentro de la banda', () => {
    // 100 Bs de diferencia sobre 22.259,77 es ~0,45%: dentro del 1%.
    const check = amountDiscrepancy({
      ...PAGO_MOVIL,
      amountVesMinor: 2225977 - 10000,
    });
    expect(check.matches).toBe(true);
    expect(check.differenceMinor).toBe(-10000);
  });

  it('marca el pago de menos fuera de la banda', () => {
    const check = amountDiscrepancy({ ...PAGO_MOVIL, amountVesMinor: 1000000 });
    expect(check.matches).toBe(false);
    expect(check.differenceMinor).toBe(-1225977);
  });

  it('marca también el pago de más: el admin decide qué hacer', () => {
    const check = amountDiscrepancy({ ...BINANCE, amountUsdMinor: 5000 });
    expect(check).toMatchObject({
      currency: 'USD',
      expectedMinor: 2800,
      reportedMinor: 5000,
      differenceMinor: 2200,
      matches: false,
    });
  });

  it('marca en USD cuando pagan el precio del plan equivocado', () => {
    // Reportó $15 (Básico) para una suscripción Full.
    const check = amountDiscrepancy({ ...BINANCE, amountUsdMinor: 1500 });
    expect(check.matches).toBe(false);
    expect(check.differenceMinor).toBe(-1300);
  });

  it('respeta la tolerancia configurada', () => {
    const reportado = { ...BINANCE, amountUsdMinor: 2700 };
    // Con 1% la diferencia de $1.00 sobre $28.00 se marca...
    expect(amountDiscrepancy(reportado, 100).matches).toBe(false);
    // ...y con 5% entra en la banda.
    expect(amountDiscrepancy(reportado, 500).matches).toBe(true);
  });

  it('con tolerancia 0 solo cuadra el monto exacto', () => {
    expect(amountDiscrepancy(BINANCE, 0).matches).toBe(true);
    expect(
      amountDiscrepancy({ ...BINANCE, amountUsdMinor: 2801 }, 0).matches,
    ).toBe(false);
  });
});
