import { addMonths, nextPeriodEnd } from './subscription-period.util';

describe('addMonths', () => {
  it('suma un mes calendario', () => {
    expect(
      addMonths(new Date('2026-08-31T16:00:00.000Z'), 1).toISOString(),
    ).toBe('2026-09-30T16:00:00.000Z');
  });

  it('no se desborda al mes siguiente cuando el día no existe', () => {
    // 31 de enero + 1 mes = 28 de febrero, no 3 de marzo.
    expect(
      addMonths(new Date('2026-01-31T10:00:00.000Z'), 1).toISOString(),
    ).toBe('2026-02-28T10:00:00.000Z');
    // 2028 es bisiesto.
    expect(
      addMonths(new Date('2028-01-31T10:00:00.000Z'), 1).toISOString(),
    ).toBe('2028-02-29T10:00:00.000Z');
  });

  it('cruza el fin de año', () => {
    expect(
      addMonths(new Date('2026-12-15T10:00:00.000Z'), 1).toISOString(),
    ).toBe('2027-01-15T10:00:00.000Z');
  });
});

describe('nextPeriodEnd', () => {
  const now = new Date('2026-08-31T16:00:00.000Z');

  it('sin período previo, el mes corre desde ahora', () => {
    expect(nextPeriodEnd(now, null).toISOString()).toBe(
      '2026-09-30T16:00:00.000Z',
    );
  });

  it('encadena al período vigente: pagar antes no regala ni quita días', () => {
    const vigente = new Date('2026-09-10T16:00:00.000Z');
    expect(nextPeriodEnd(now, vigente).toISOString()).toBe(
      '2026-10-10T16:00:00.000Z',
    );
  });

  it('si el período ya venció, el mes corre desde ahora', () => {
    const vencido = new Date('2026-08-01T16:00:00.000Z');
    expect(nextPeriodEnd(now, vencido).toISOString()).toBe(
      '2026-09-30T16:00:00.000Z',
    );
  });
});

describe('nextPeriodEnd con prueba', () => {
  const now = new Date('2026-08-31T16:00:00.000Z');

  it('primer pago durante la prueba: el mes arranca al vencer el trial', () => {
    // Paga hoy, pero le quedan días de prueba hasta el 10 de septiembre.
    const trialEndsAt = new Date('2026-09-10T16:00:00.000Z');
    expect(nextPeriodEnd(now, null, trialEndsAt).toISOString()).toBe(
      '2026-10-10T16:00:00.000Z',
    );
  });

  it('primer pago en gracia: la prueba ya venció, el mes corre desde hoy', () => {
    const trialEndsAt = new Date('2026-08-20T16:00:00.000Z');
    expect(nextPeriodEnd(now, null, trialEndsAt).toISOString()).toBe(
      '2026-09-30T16:00:00.000Z',
    );
  });

  it('manda la fecha más lejana entre el período vigente y la prueba', () => {
    const vigente = new Date('2026-09-20T16:00:00.000Z');
    const trialEndsAt = new Date('2026-09-10T16:00:00.000Z');
    expect(nextPeriodEnd(now, vigente, trialEndsAt).toISOString()).toBe(
      '2026-10-20T16:00:00.000Z',
    );
    expect(nextPeriodEnd(now, trialEndsAt, vigente).toISOString()).toBe(
      '2026-10-20T16:00:00.000Z',
    );
  });
});
