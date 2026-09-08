import type { DataSource, Repository } from 'typeorm';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import { SubscriptionService } from './subscription.service';
import { TRIAL_DAYS } from './config/plans.config';
import type { Subscription } from './entities/subscription.entity';

/**
 * El alta de la prueba (SUB-1): sin esta fila el tenant cae en la rama de "sin
 * suscripción" y su prueba no vence nunca.
 */

function buildService(existing: Partial<Subscription> | null) {
  const subscriptions = {
    findOne: jest.fn().mockResolvedValue(existing),
    create: jest.fn((draft: Partial<Subscription>) => draft),
    save: jest.fn((draft: Partial<Subscription>) =>
      Promise.resolve({ id: 99, ...draft }),
    ),
  };

  const service = new SubscriptionService(
    subscriptions as unknown as Repository<Subscription>,
    {} as unknown as DataSource,
    { emit: jest.fn() } as unknown as EventEmitter2,
  );

  return { service, subscriptions };
}

describe('el alta de la prueba', () => {
  it('nace en prueba, con 15 días y SIN plan elegido', async () => {
    const { service, subscriptions } = buildService(null);
    const now = new Date('2026-09-01T12:00:00.000Z');

    const created = await service.startTrial(7, now);

    expect(subscriptions.save).toHaveBeenCalledTimes(1);
    expect(created).toMatchObject({
      companyId: 7,
      status: 'trialing',
      // El registro no pide elegir: la fila no puede decir que eligió.
      planId: null,
      currentPeriodEnd: null,
      graceEndsAt: null,
    });
    expect(created.trialEndsAt?.toISOString()).toBe(
      new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString(),
    );
  });

  it('no regala una prueba nueva a quien ya tiene suscripción', async () => {
    const { service, subscriptions } = buildService({
      id: 3,
      companyId: 7,
      planId: 'full',
      status: 'active',
    });

    const result = await service.startTrial(7);

    expect(subscriptions.save).not.toHaveBeenCalled();
    expect(result).toMatchObject({ id: 3, status: 'active' });
  });
});

/**
 * SUB-11: elegir plan. Lo que el ticket promete es que se puede elegir CUANDO
 * SEA sin perder días, y que elegir no cobra ni cambia lo que puede usar hoy.
 */
describe('elegir plan', () => {
  const trial: Partial<Subscription> = {
    id: 3,
    companyId: 7,
    planId: null,
    status: 'trialing',
    trialEndsAt: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000),
    currentPeriodEnd: null,
    graceEndsAt: null,
  };

  it('el día 1 de la prueba: fija el plan sin tocar ninguna fecha', async () => {
    const { service, subscriptions } = buildService({ ...trial });

    const saved = await service.choosePlan(7, 'basico');

    expect(saved.planId).toBe('basico');
    // Elegir no cobra ni activa: las fechas y el estado quedan igual.
    expect(saved.status).toBe('trialing');
    expect(saved.trialEndsAt).toEqual(trial.trialEndsAt);
    expect(saved.currentPeriodEnd).toBeNull();
    expect(subscriptions.save).toHaveBeenCalledTimes(1);
  });

  it('también se puede elegir con la prueba ya vencida', async () => {
    const { service } = buildService({
      ...trial,
      status: 'grace',
      trialEndsAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    });

    expect((await service.choosePlan(7, 'full')).planId).toBe('full');
  });

  it('elegir el mismo plan no vuelve a escribir', async () => {
    const { service, subscriptions } = buildService({
      ...trial,
      planId: 'full',
    });

    await service.choosePlan(7, 'full');

    expect(subscriptions.save).not.toHaveBeenCalled();
  });

  it('con un mes PAGADO corriendo no se cambia de plan', async () => {
    // Dejarlo cambiar sería subir de plan sin pagar la diferencia.
    const { service, subscriptions } = buildService({
      ...trial,
      planId: 'basico',
      status: 'active',
      currentPeriodEnd: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
    });

    await expect(service.choosePlan(7, 'full')).rejects.toThrow(
      /próxima renovación/,
    );
    expect(subscriptions.save).not.toHaveBeenCalled();
  });

  it('con el mes pagado ya vencido sí puede elegir de nuevo', async () => {
    const { service } = buildService({
      ...trial,
      planId: 'basico',
      status: 'grace',
      currentPeriodEnd: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    });

    expect((await service.choosePlan(7, 'full')).planId).toBe('full');
  });
});
