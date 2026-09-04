import {
  effectiveLimits,
  resolveAccess,
  type AccessInput,
} from './entitlements.util';

const NOW = new Date('2026-08-31T12:00:00.000Z');

/** Fecha relativa a "ahora" en días (negativo = pasado). */
function days(n: number): Date {
  return new Date(NOW.getTime() + n * 24 * 60 * 60 * 1000);
}

function access(
  subscription: AccessInput['subscription'],
  hasPendingReport = false,
) {
  return resolveAccess({
    subscription,
    hasPendingReport,
    graceDays: 5,
    now: NOW,
  });
}

describe('matriz de acceso por estado', () => {
  it('trialing: acceso completo durante la prueba', () => {
    expect(
      access({
        planId: 'basico',
        status: 'trialing',
        trialEndsAt: days(10),
        currentPeriodEnd: null,
        graceEndsAt: null,
      }),
    ).toMatchObject({ status: 'trialing', canOperate: true, graceCause: null });
  });

  it('active: acceso completo con el período vigente', () => {
    expect(
      access({
        planId: 'full',
        status: 'active',
        trialEndsAt: days(-20),
        currentPeriodEnd: days(12),
        graceEndsAt: null,
      }),
    ).toMatchObject({ status: 'active', canOperate: true });
  });

  it('grace: venció hace 2 días, sigue operando (cortesía)', () => {
    const state = access({
      planId: 'full',
      status: 'active',
      trialEndsAt: null,
      currentPeriodEnd: days(-2),
      graceEndsAt: null,
    });
    expect(state).toMatchObject({
      status: 'grace',
      canOperate: true,
      graceCause: 'expired',
    });
    // La ventana se calcula desde el corte: 2 días vencido + 5 de gracia.
    expect(state.graceEndsAt?.toISOString()).toBe(days(3).toISOString());
  });

  it('blocked: gracia agotada y sin pago reportado', () => {
    expect(
      access({
        planId: 'full',
        status: 'grace',
        trialEndsAt: null,
        currentPeriodEnd: days(-10),
        graceEndsAt: null,
      }),
    ).toMatchObject({ status: 'blocked', canOperate: false });
  });

  it('la prueba vencida también entra en gracia y luego bloquea', () => {
    expect(
      access({
        planId: 'basico',
        status: 'trialing',
        trialEndsAt: days(-1),
        currentPeriodEnd: null,
        graceEndsAt: null,
      }),
    ).toMatchObject({ status: 'grace', graceCause: 'expired' });

    expect(
      access({
        planId: 'basico',
        status: 'trialing',
        trialEndsAt: days(-30),
        currentPeriodEnd: null,
        graceEndsAt: null,
      }),
    ).toMatchObject({ status: 'blocked', canOperate: false });
  });

  it('respeta la gracia ya guardada en la fila, no la recalcula', () => {
    const state = access({
      planId: 'full',
      status: 'grace',
      trialEndsAt: null,
      currentPeriodEnd: days(-10),
      graceEndsAt: days(2),
    });
    expect(state).toMatchObject({ status: 'grace', canOperate: true });
  });
});

describe('invariante del pago pendiente', () => {
  it('un reporte por verificar concede acceso aunque la gracia esté agotada', () => {
    const vencidoHaceMucho: AccessInput['subscription'] = {
      planId: 'full',
      status: 'blocked',
      trialEndsAt: null,
      currentPeriodEnd: days(-30),
      graceEndsAt: days(-25),
    };

    expect(access(vencidoHaceMucho, false)).toMatchObject({
      status: 'blocked',
      canOperate: false,
    });

    // Mismo tenant, mismo día, pero con un pago esperando verificación: no se
    // le castiga por la latencia de NUESTRA verificación.
    expect(access(vencidoHaceMucho, true)).toMatchObject({
      status: 'grace',
      canOperate: true,
      graceCause: 'pending_report',
    });
  });

  it('dentro de la ventana de gracia la causa sigue siendo el vencimiento', () => {
    expect(
      access(
        {
          planId: 'full',
          status: 'grace',
          trialEndsAt: null,
          currentPeriodEnd: days(-1),
          graceEndsAt: null,
        },
        true,
      ),
    ).toMatchObject({ graceCause: 'expired', canOperate: true });
  });
});

describe('tenant sin suscripción', () => {
  it('no se bloquea: es alguien que el sistema aún no dio de alta', () => {
    expect(access(null)).toMatchObject({
      status: 'trialing',
      canOperate: true,
      accessEndsAt: null,
    });
  });
});

describe('estado guardado vs. estado real', () => {
  it('la columna status no manda: mandan las fechas', () => {
    // La fila dice `active` pero el período venció hace un mes: el cron todavía
    // no la ha tocado y aun así el acceso tiene que estar cerrado.
    expect(
      access({
        planId: 'full',
        status: 'active',
        trialEndsAt: null,
        currentPeriodEnd: days(-30),
        graceEndsAt: null,
      }),
    ).toMatchObject({ status: 'blocked', canOperate: false });

    // Y al revés: dice `blocked` pero pagó y su período está vigente.
    expect(
      access({
        planId: 'full',
        status: 'blocked',
        trialEndsAt: null,
        currentPeriodEnd: days(15),
        graceEndsAt: null,
      }),
    ).toMatchObject({ status: 'active', canOperate: true });
  });
});

describe('los límites efectivos', () => {
  it('en prueba: todo abierto y sin tope, aunque el plan sea Básico', () => {
    expect(effectiveLimits('basico', 'trialing')).toEqual({
      maxWorkers: null,
      payroll: true,
      analytics: true,
      aiSuggestions: true,
      workerApp: true,
      clientApp: true,
      prioritySupport: true,
    });
  });

  it('fuera de la prueba mandan los del plan', () => {
    expect(effectiveLimits('basico', 'active')).toMatchObject({
      maxWorkers: 2,
      payroll: false,
      aiSuggestions: false,
    });
    expect(effectiveLimits('basico', 'grace')).toMatchObject({
      maxWorkers: 2,
      aiSuggestions: false,
    });
    expect(effectiveLimits('full', 'active')).toMatchObject({
      maxWorkers: 20,
      aiSuggestions: true,
    });
  });
});
