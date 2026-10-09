jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));

import { ReportsService } from './reports.service';

/**
 * "Clientes nuevos" cuenta a quien se registró hace poco aunque no tenga citas.
 * La fecha de alta es la del cliente: el que no tiene correo no tiene cuenta,
 * y antes se leía de `user.created_at`.
 */
function serviceWith(clients: unknown[]) {
  const chain = (result: unknown) => {
    const qb: Record<string, jest.Mock> = {};
    for (const method of [
      'leftJoinAndSelect',
      'innerJoin',
      'select',
      'addSelect',
      'where',
      'andWhere',
      'groupBy',
    ]) {
      qb[method] = jest.fn(() => qb);
    }
    qb.getMany = jest.fn().mockResolvedValue(result);
    qb.getRawMany = jest.fn().mockResolvedValue([]);
    return qb;
  };

  const service = Object.create(ReportsService.prototype) as Record<
    string,
    unknown
  >;
  service.clientRepository = { createQueryBuilder: () => chain(clients) };
  service.sessionRepository = { createQueryBuilder: () => chain([]) };
  service.ACTIVE_WINDOW_MS = 30 * 86_400_000;
  return service;
}

type Activity = { registeredMs: number | null };

function activities(clients: unknown[]): Promise<Activity[]> {
  const service = serviceWith(clients);
  const target = service as unknown as {
    loadClientActivities: (id: number) => Promise<Activity[]>;
  };
  return target.loadClientActivities(41);
}

describe('fecha de alta del cliente en los reportes', () => {
  const ayer = new Date(Date.now() - 86_400_000);
  const haceUnAnio = new Date(Date.now() - 365 * 86_400_000);

  it('el cliente sin cuenta usa su propia fecha de alta', async () => {
    const [a] = await activities([
      { id: 1, createdAt: ayer, user: null, companyFirstAppointments: [] },
    ]);
    expect(a.registeredMs).toBe(ayer.getTime());
  });

  it('con las dos fechas, manda la del cliente', async () => {
    const [a] = await activities([
      {
        id: 1,
        createdAt: ayer,
        user: { createdAt: haceUnAnio },
        companyFirstAppointments: [],
      },
    ]);
    expect(a.registeredMs).toBe(ayer.getTime());
  });

  it('sin fecha del cliente (no debería pasar) se usa la de la cuenta', async () => {
    const [a] = await activities([
      { id: 1, user: { createdAt: haceUnAnio }, companyFirstAppointments: [] },
    ]);
    expect(a.registeredMs).toBe(haceUnAnio.getTime());
  });

  it('el cliente sin cuenta registrado ayer cuenta como nuevo', async () => {
    const service = serviceWith([
      { id: 1, createdAt: ayer, user: null, companyFirstAppointments: [] },
    ]) as unknown as {
      loadClientActivities: (id: number) => Promise<Activity[]>;
      isNewAt: (a: Activity, ref: number) => boolean;
    };
    const [a] = await service.loadClientActivities(41);
    expect(service.isNewAt(a, Date.now())).toBe(true);
  });
});
