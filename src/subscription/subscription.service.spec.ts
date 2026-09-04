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
  it('nace en prueba, con 15 días y en el plan Full', async () => {
    const { service, subscriptions } = buildService(null);
    const now = new Date('2026-09-01T12:00:00.000Z');

    const created = await service.startTrial(7, now);

    expect(subscriptions.save).toHaveBeenCalledTimes(1);
    expect(created).toMatchObject({
      companyId: 7,
      status: 'trialing',
      // La prueba ES el Full: la fila dice lo mismo que ve el dueño.
      planId: 'full',
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
