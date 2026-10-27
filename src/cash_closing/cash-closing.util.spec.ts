import { normalizeClosingMethod } from './cash-closing.enums';
import {
  aggregateExpected,
  buildClosingLines,
  countedCashByCurrency,
  findDuplicateCell,
  paidEntry,
  totalsByCurrency,
  type ClosingEntry,
} from './cash-closing.util';

describe('normalizeClosingMethod', () => {
  it('funde el vocabulario de cobros y el de caja en una sola fila', () => {
    expect(normalizeClosingMethod('cash')).toBe('cash');
    expect(normalizeClosingMethod('efectivo')).toBe('cash');
    expect(normalizeClosingMethod('pago_movil')).toBe('mobile_payment');
    expect(normalizeClosingMethod('transferencia')).toBe('transfer');
    expect(normalizeClosingMethod('card')).toBe('card');
  });

  it('un método vacío o desconocido cae en otro', () => {
    expect(normalizeClosingMethod(null)).toBe('other');
    expect(normalizeClosingMethod('zelle')).toBe('other');
  });

  it('el efectivo en Bs tiene su propia fila', () => {
    expect(normalizeClosingMethod('cash_bs')).toBe('cash_bs');
  });
});

describe('paidEntry', () => {
  it('un cobro en Bs de un servicio en $ se cuenta en Bs', () => {
    expect(paidEntry('mobile_payment', 'USD', 2000, 78466, 'sessions')).toEqual(
      {
        currency: 'VES',
        method: 'mobile_payment',
        source: 'sessions',
        amountMinor: 78466,
      },
    );
    expect(paidEntry('cash_bs', 'USD', 2000, 78466, 'tips')).toMatchObject({
      currency: 'VES',
      method: 'cash_bs',
      amountMinor: 78466,
    });
  });

  it('el efectivo en Bs de la caja manual va a la misma fila que el cobro', () => {
    const cells = aggregateExpected(
      [
        paidEntry('cash_bs', 'USD', 1000, 39233, 'sessions'),
        {
          currency: 'VES',
          method: 'cash',
          source: 'manualIncome',
          amountMinor: 767,
        },
      ],
      [{ currency: 'VES', amountMinor: 1000 }],
    );
    expect(cells).toHaveLength(1);
    expect(cells[0]).toMatchObject({
      currency: 'VES',
      method: 'cash_bs',
      amountMinor: 41000,
    });
  });

  it('el efectivo en divisa se queda en su moneda', () => {
    expect(paidEntry('cash', 'USD', 2000, 78466, 'sessions')).toMatchObject({
      currency: 'USD',
      method: 'cash',
      amountMinor: 2000,
    });
  });

  it('sin equivalente en Bs no inventa una conversión', () => {
    expect(paidEntry('transfer', 'USD', 2000, null, 'sessions')).toMatchObject({
      currency: 'USD',
      amountMinor: 2000,
    });
  });
});

describe('aggregateExpected', () => {
  const entries: ClosingEntry[] = [
    { currency: 'usd', method: 'cash', source: 'sessions', amountMinor: 2000 },
    { currency: 'USD', method: 'cash', source: 'tips', amountMinor: 300 },
    {
      currency: 'VES',
      method: 'transfer',
      source: 'sessions',
      amountMinor: 50000,
    },
    {
      currency: 'USD',
      method: 'cash',
      source: 'manualExpense',
      amountMinor: -500,
    },
  ];

  it('suma por moneda y método, con el fondo en el efectivo', () => {
    const cells = aggregateExpected(entries, [
      { currency: 'USD', amountMinor: 1000 },
    ]);
    expect(cells).toHaveLength(2);

    const [ves, usd] = cells;
    expect(ves).toMatchObject({
      currency: 'VES',
      method: 'transfer',
      amountMinor: 50000,
    });
    expect(usd).toMatchObject({
      currency: 'USD',
      method: 'cash',
      amountMinor: 2800,
      tipsMinor: 300,
    });
    expect(usd.breakdown).toMatchObject({
      opening: 1000,
      sessions: 2000,
      tips: 300,
      manualExpense: -500,
    });
  });

  it('un fondo en 0 no crea celda, pero un movimiento que neta 0 sí', () => {
    const cells = aggregateExpected(
      [
        {
          currency: 'EUR',
          method: 'cash',
          source: 'manualIncome',
          amountMinor: 100,
        },
        {
          currency: 'EUR',
          method: 'cash',
          source: 'manualExpense',
          amountMinor: -100,
        },
      ],
      [{ currency: 'VES', amountMinor: 0 }],
    );
    expect(cells).toHaveLength(1);
    expect(cells[0]).toMatchObject({ currency: 'EUR', amountMinor: 0 });
  });
});

describe('buildClosingLines', () => {
  const expected = aggregateExpected(
    [
      {
        currency: 'USD',
        method: 'cash',
        source: 'sessions',
        amountMinor: 2000,
      },
      {
        currency: 'VES',
        method: 'mobile_payment',
        source: 'sessions',
        amountMinor: 40000,
      },
    ],
    [],
  );

  it('calcula la diferencia por celda', () => {
    const { lines, missing } = buildClosingLines(expected, [
      { currency: 'USD', method: 'cash', amountMinor: 1900 },
      { currency: 'VES', method: 'mobile_payment', amountMinor: 40000 },
    ]);
    expect(missing).toHaveLength(0);
    expect(lines.find((l) => l.currency === 'USD')?.differenceMinor).toBe(-100);
    expect(lines.find((l) => l.currency === 'VES')?.differenceMinor).toBe(0);
  });

  it('no asume en 0 una celda que no se contó', () => {
    const { missing } = buildClosingLines(expected, [
      { currency: 'USD', method: 'cash', amountMinor: 2000 },
    ]);
    expect(missing).toEqual([
      expect.objectContaining({ currency: 'VES', method: 'mobile_payment' }),
    ]);
  });

  it('una celda contada que no se esperaba sale como sobrante', () => {
    const { lines } = buildClosingLines(expected, [
      { currency: 'USD', method: 'cash', amountMinor: 2000 },
      { currency: 'VES', method: 'mobile_payment', amountMinor: 40000 },
      { currency: 'EUR', method: 'cash', amountMinor: 500 },
    ]);
    expect(lines.find((l) => l.currency === 'EUR')).toMatchObject({
      expectedMinor: 0,
      countedMinor: 500,
      differenceMinor: 500,
    });
  });

  it('totaliza por moneda y saca el efectivo contado para el fondo', () => {
    const { lines } = buildClosingLines(expected, [
      { currency: 'USD', method: 'cash', amountMinor: 2100 },
      { currency: 'VES', method: 'mobile_payment', amountMinor: 40000 },
    ]);
    expect(countedCashByCurrency(lines)).toEqual([
      { currency: 'USD', amountMinor: 2100 },
    ]);
    expect(totalsByCurrency(lines).map((t) => t.currency)).toEqual([
      'VES',
      'USD',
    ]);
  });
});

describe('findDuplicateCell', () => {
  it('detecta la misma celda aunque cambie la capitalización', () => {
    expect(
      findDuplicateCell([
        { currency: 'USD', method: 'cash', amountMinor: 1 },
        { currency: 'usd', method: 'cash', amountMinor: 2 },
      ]),
    ).toMatchObject({ amountMinor: 2 });
    expect(
      findDuplicateCell([{ currency: 'USD', method: 'cash', amountMinor: 1 }]),
    ).toBeNull();
  });
});
