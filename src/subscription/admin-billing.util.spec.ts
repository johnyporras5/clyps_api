import {
  extendedTrialEnd,
  extraTrialEnd,
  trialAfterVipRevoked,
} from './admin-billing.util';

const now = new Date('2026-11-09T15:00:00.000Z');
const days = (n: number) => new Date(now.getTime() + n * 24 * 60 * 60 * 1000);

const base = {
  billingExempt: false,
  trialEndsAt: days(-3),
  currentPeriodEnd: null as Date | null,
};

describe('extraTrialEnd', () => {
  it('cuenta 15 días desde HOY, no desde que venció', () => {
    expect(extraTrialEnd(now).toISOString()).toBe(days(15).toISOString());
  });
});

describe('extendedTrialEnd', () => {
  it('prueba vencida (hace días o hace meses): hoy + 15', () => {
    expect(extendedTrialEnd(days(-3), now)).toEqual(days(15));
    expect(extendedTrialEnd(days(-200), now)).toEqual(days(15));
  });

  it('sin fecha de prueba: hoy + 15', () => {
    expect(extendedTrialEnd(null, now)).toEqual(days(15));
  });

  it('vence justo ahora: hoy + 15', () => {
    expect(extendedTrialEnd(now, now)).toEqual(days(15));
  });

  it('prueba que sigue corriendo: suma sobre lo que le queda, no se lo quita', () => {
    expect(extendedTrialEnd(days(10), now)).toEqual(days(25));
    expect(extendedTrialEnd(days(30), now)).toEqual(days(45));
  });
});

describe('trialAfterVipRevoked', () => {
  const vip = { ...base, billingExempt: true };

  it('le da 15 días desde hoy si su fecha ya pasó', () => {
    expect(trialAfterVipRevoked(vip, now)?.toISOString()).toBe(
      days(15).toISOString(),
    );
  });

  it('también si pagó y su mes se venció mientras era VIP', () => {
    expect(
      trialAfterVipRevoked({ ...vip, currentPeriodEnd: days(-90) }, now),
    ).toEqual(days(15));
  });

  it('si su mes pagado llega más lejos de 15 días, no se toca', () => {
    expect(
      trialAfterVipRevoked({ ...vip, currentPeriodEnd: days(20) }, now),
    ).toBeNull();
  });

  it('si su mes pagado vence antes de 15 días, se le dan los 15', () => {
    expect(
      trialAfterVipRevoked({ ...vip, currentPeriodEnd: days(4) }, now),
    ).toEqual(days(15));
  });

  it('si su prueba ya llega más lejos, no se la acorta', () => {
    expect(
      trialAfterVipRevoked({ ...vip, trialEndsAt: days(30) }, now),
    ).toBeNull();
  });
});
