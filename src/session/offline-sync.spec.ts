jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));

import { BadRequestException } from '@nestjs/common';
import { SessionService } from './session.service';
import { ReminderSchedulerService } from './reminder-scheduler.service';

/**
 * BE-OFF-3: citas agendadas sin red que llegan tarde.
 * - Ofertas: se respeta la que la tarea nocturna venció entre que se agendó y
 *   que llegó; no la que el dueño apagó a mano.
 * - Recordatorios: solo miran citas que EMPIEZAN PRONTO, así que una cita que
 *   ya pasó nunca recibe uno.
 */

function offerQuery(found: unknown) {
  const qb = {
    innerJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(found),
  };
  const service = Object.create(SessionService.prototype) as Record<
    string,
    unknown
  >;
  Object.assign(service, {
    serviceOfferRepository: { createQueryBuilder: jest.fn(() => qb) },
  });
  const resolve = (
    service as unknown as {
      resolveServicePrice: (
        serviceId: number,
        companyId: number,
        offerId?: number,
        referenceDate?: Date,
        createdOfflineAt?: Date | null,
      ) => Promise<{ finalPrice: number; isOffer: boolean }>;
    }
  ).resolveServicePrice.bind(service);
  const conditions = () =>
    qb.andWhere.mock.calls.map((call: unknown[]) => call[0] as string);
  return { resolve, qb, conditions };
}

const OFFER = { price: '20.00', offer: { name: 'Black Friday' } };

describe('precio de oferta en una cita sincronizada tarde', () => {
  it('con conexión: la oferta tiene que estar activa (como siempre)', async () => {
    const t = offerQuery(OFFER);
    await t.resolve(25, 1, 9, new Date('2026-11-20T15:00:00Z'));
    expect(t.conditions()).toContain('offer.status = 1');
    expect(t.conditions().join(' ')).not.toContain('businessToday');
  });

  it('sin red: también vale la oferta que la tarea venció por fecha', async () => {
    const t = offerQuery(OFFER);
    const result = await t.resolve(
      25,
      1,
      9,
      new Date('2026-11-20T15:00:00Z'),
      new Date('2026-11-20T13:00:00Z'),
    );
    expect(result).toMatchObject({ finalPrice: 20, isOffer: true });
    const offlineCondition = t.qb.andWhere.mock.calls.find((call: unknown[]) =>
      String(call[0]).includes('offer.status = 1 OR'),
    );
    // Activa, o vencida porque su fecha de fin ya pasó. Una apagada a mano
    // (status 0 y aún en fechas) no cumple ninguna de las dos.
    expect(offlineCondition?.[0]).toBe(
      '(offer.status = 1 OR offer.endDate < :businessToday)',
    );
    expect(offlineCondition?.[1]).toEqual({
      businessToday: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    });
    expect(t.conditions()).not.toContain('offer.status = 1');
  });

  it('sin red y sin fecha de la cita: la vigencia se mira cuando se agendó', async () => {
    const t = offerQuery(OFFER);
    const createdOfflineAt = new Date('2026-11-19T13:00:00Z');
    await t.resolve(25, 1, 9, undefined, createdOfflineAt);
    const startCall = t.qb.andWhere.mock.calls.find((call: unknown[]) =>
      String(call[0]).startsWith('offer.startDate'),
    );
    expect(startCall?.[1]).toEqual({ checkDate: createdOfflineAt });
  });

  it('si la oferta no cumple: 400 como siempre', async () => {
    const t = offerQuery(null);
    await expect(
      t.resolve(25, 1, 9, undefined, new Date('2026-11-19T13:00:00Z')),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('recordatorios: nunca de una cita que ya pasó', () => {
  function scheduler() {
    const query = jest.fn().mockResolvedValue([]);
    const emitter = {
      remindClient24h: jest.fn(),
      remindClient2h: jest.fn(),
      remindStaff1h: jest.fn(),
      remindStaffNow: jest.fn(),
    };
    const svc = new ReminderSchedulerService(
      { query } as never,
      {} as never,
      emitter as never,
      {} as never,
    );
    return { svc, query };
  }

  it('cada recordatorio busca solo citas que empiezan desde AHORA en adelante', async () => {
    const { svc, query } = scheduler();
    await svc.clientReminder24h();
    await svc.clientReminder2h();
    await svc.staffReminder1h();
    await svc.staffReminderNow();

    expect(query).toHaveBeenCalledTimes(4);
    for (const [sql, params] of query.mock.calls as Array<[string, number[]]>) {
      expect(sql).toContain(
        'session_datetime >= DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? MINUTE)',
      );
      const [, , from, to] = params;
      expect(from).toBeGreaterThanOrEqual(0); // nunca mira hacia atrás
      expect(to).toBeGreaterThan(from);
    }
  });
});
