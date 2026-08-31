import {
  nullableMoneyTransformer,
  rateTransformer,
  usdMinorToVesMinor,
} from './subscription-money.util';

describe('usdMinorToVesMinor', () => {
  it('cotiza el plan Básico a la tasa dada', () => {
    // $15.00 a 36.50 Bs/USD = 547.50 Bs
    expect(usdMinorToVesMinor(1500, 36.5)).toBe(54750);
  });

  it('redondea al céntimo', () => {
    expect(usdMinorToVesMinor(2800, 36.1234)).toBe(101146);
  });

  it('rechaza una tasa no positiva', () => {
    expect(() => usdMinorToVesMinor(1500, 0)).toThrow();
    expect(() => usdMinorToVesMinor(1500, -1)).toThrow();
  });
});

describe('nullableMoneyTransformer', () => {
  it('conserva el null: "no aplica" no es cero', () => {
    expect(nullableMoneyTransformer.from(null)).toBeNull();
    expect(nullableMoneyTransformer.to(null)).toBeNull();
  });

  it('normaliza el bigint que mysql2 devuelve como string', () => {
    expect(nullableMoneyTransformer.from('54750')).toBe(54750);
  });
});

describe('rateTransformer', () => {
  it('normaliza el decimal que mysql2 devuelve como string', () => {
    expect(rateTransformer.from('36.5000')).toBe(36.5);
    expect(rateTransformer.from(null)).toBeNull();
  });
});
