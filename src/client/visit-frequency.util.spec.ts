import {
  calendarDaysBetween,
  estimateVisitFrequencyDays,
  upsertVisitFrequency,
  visitFrequencyFor,
  visitFrequencyStage,
} from './visit-frequency.util';

const day = (n: number) => new Date(Date.UTC(2026, 0, 1 + n, 14, 0));

describe('estimateVisitFrequencyDays', () => {
  it('promedia los intervalos entre visitas', () => {
    expect(estimateVisitFrequencyDays([day(0), day(15), day(35)])).toBe(18);
    expect(estimateVisitFrequencyDays([day(0), day(15), day(34)])).toBe(17);
  });

  it('no calcula con menos de dos visitas', () => {
    expect(estimateVisitFrequencyDays([])).toBeNull();
    expect(estimateVisitFrequencyDays([day(3)])).toBeNull();
  });

  it('ignora el orden de entrada y las fechas vacías', () => {
    expect(
      estimateVisitFrequencyDays([day(30), null, day(0), day(10), undefined]),
    ).toBe(15);
  });

  it('cuenta dos citas del mismo día como una sola visita', () => {
    const sameDayLater = new Date(day(10).getTime() + 3 * 60 * 60 * 1000);
    expect(estimateVisitFrequencyDays([day(0), day(10), sameDayLater])).toBe(
      10,
    );
  });

  it('usa solo los intervalos más recientes', () => {
    const visits = [
      day(0),
      day(100),
      day(110),
      day(120),
      day(130),
      day(140),
      day(150),
    ];
    expect(estimateVisitFrequencyDays(visits)).toBe(10);
  });

  it('acepta fechas en texto', () => {
    expect(
      estimateVisitFrequencyDays([
        '2026-01-01 10:00:00',
        '2026-01-08 18:00:00',
      ]),
    ).toBe(7);
  });
});

describe('upsertVisitFrequency', () => {
  const now = new Date('2026-11-13T12:00:00.000Z');

  it('reemplaza solo la entrada del negocio', () => {
    const result = upsertVisitFrequency(
      [
        { companyId: 1, days: 10, source: 'manual', updatedAt: 'x' },
        { companyId: 2, days: 30, source: 'auto', updatedAt: 'x' },
      ],
      1,
      17,
      'auto',
      now,
    );
    expect(result).toEqual([
      { companyId: 2, days: 30, source: 'auto', updatedAt: 'x' },
      { companyId: 1, days: 17, source: 'auto', updatedAt: now.toISOString() },
    ]);
  });

  it('borra la entrada con null', () => {
    expect(
      upsertVisitFrequency(
        [{ companyId: 1, days: 10, source: 'manual', updatedAt: 'x' }],
        1,
        null,
        'manual',
      ),
    ).toEqual([]);
  });
});

describe('visitFrequencyFor', () => {
  it('devuelve la del negocio pedido', () => {
    expect(
      visitFrequencyFor(
        [
          { companyId: 2, days: 30, source: 'auto', updatedAt: 'x' },
          { companyId: 5, days: 12, source: 'manual', updatedAt: 'x' },
        ],
        [5],
      ),
    ).toEqual({ visitFrequencyDays: 12, visitFrequencySource: 'manual' });
  });

  it('devuelve null si no hay', () => {
    expect(visitFrequencyFor(null, [5])).toEqual({
      visitFrequencyDays: null,
      visitFrequencySource: null,
    });
  });
});

describe('visitFrequencyStage', () => {
  it('avisa unos días antes', () => {
    expect(visitFrequencyStage(17, 15)).toBe('soon');
    expect(visitFrequencyStage(17, 16)).toBe('soon');
    expect(visitFrequencyStage(17, 14)).toBeNull();
  });

  it('no avisa antes si la frecuencia es muy corta', () => {
    expect(visitFrequencyStage(5, 4)).toBeNull();
  });

  it('avisa el día que le toca y los días siguientes', () => {
    expect(visitFrequencyStage(17, 17)).toBe('due');
    expect(visitFrequencyStage(17, 21)).toBe('due');
  });

  it('avisa cuando está atrasado y deja de avisar pasado el margen', () => {
    expect(visitFrequencyStage(17, 22)).toBe('overdue');
    expect(visitFrequencyStage(17, 47)).toBe('overdue');
    expect(visitFrequencyStage(17, 48)).toBeNull();
  });
});

describe('calendarDaysBetween', () => {
  it('cuenta días de calendario en la zona del negocio', () => {
    const lateNight = new Date('2026-11-01T03:30:00Z');
    const nextMorning = new Date('2026-11-01T13:00:00Z');
    expect(calendarDaysBetween(lateNight, nextMorning, 'America/Caracas')).toBe(
      1,
    );
    expect(calendarDaysBetween(lateNight, nextMorning, 'UTC')).toBe(0);
  });
});
