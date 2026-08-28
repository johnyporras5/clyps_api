import {
  signOf,
  signedAmountMinor,
  assertPositiveAmountMinor,
  toBsMinor,
} from './cash-transaction.util';

describe('signo derivado de kind', () => {
  it('un ingreso suma y un gasto resta', () => {
    expect(signOf('income')).toBe(1);
    expect(signOf('expense')).toBe(-1);
  });

  it('el gasto solo se vuelve negativo al agregar, nunca en la fila', () => {
    const gasto = { kind: 'expense' as const, amountMinor: 5000 };

    expect(gasto.amountMinor).toBe(5000);
    expect(signedAmountMinor(gasto)).toBe(-5000);
  });

  it('rechaza montos que no sean enteros positivos', () => {
    expect(() => assertPositiveAmountMinor(-5000)).toThrow();
    expect(() => assertPositiveAmountMinor(0)).toThrow();
    expect(() => assertPositiveAmountMinor(15.5)).toThrow();
    expect(() => assertPositiveAmountMinor(5000)).not.toThrow();
  });
});

describe('toBsMinor', () => {
  it('en Bs no convierte nada', () => {
    expect(toBsMinor('VES', 25000, null)).toBe(25000);
  });

  it('convierte con la tasa histórica', () => {
    // 50.00 USD a 36.50 Bs/USD = 1825.00 Bs
    expect(toBsMinor('USD', 5000, 36.5)).toBe(182500);
  });

  it('redondea al céntimo', () => {
    expect(toBsMinor('USD', 333, 36.57)).toBe(12178);
  });

  it('exige tasa cuando la moneda no es Bs', () => {
    expect(() => toBsMinor('USD', 5000, null)).toThrow(/tasa de cambio/);
    expect(() => toBsMinor('EUR', 5000, 0)).toThrow(/tasa de cambio/);
  });
});
