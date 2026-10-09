jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));

import { ServiceService } from './service.service';

/**
 * Los trabajadores asignados a un servicio. Uno sin correo no tiene cuenta, y
 * antes el INNER JOIN con `user` lo sacaba de la lista sin avisar.
 */
function queryBuilder(result: unknown[], calls: string[]) {
  const qb: Record<string, jest.Mock> = {};
  for (const method of [
    'innerJoinAndSelect',
    'leftJoinAndSelect',
    'where',
    'andWhere',
    'select',
    'addSelect',
    'groupBy',
  ]) {
    qb[method] = jest.fn((...args: unknown[]) => {
      calls.push(`${method}(${String(args[0])})`);
      return qb;
    });
  }
  qb.getMany = jest.fn().mockResolvedValue(result);
  qb.getRawMany = jest.fn().mockResolvedValue([]);
  return qb;
}

describe('trabajadores de un servicio, con y sin cuenta', () => {
  const sinCuenta = {
    id: 7,
    startDate: null,
    endDate: null,
    isActive: 1,
    worker: { id: 3, name: 'Luis', picture: null, user: null },
  };
  const conCuenta = {
    id: 8,
    startDate: null,
    endDate: null,
    isActive: 1,
    worker: {
      id: 4,
      name: 'Ana',
      picture: null,
      user: { id: 99, username: 'ana', email: 'ana@x.com' },
    },
  };

  async function run(companyWorkers: unknown[]) {
    const calls: string[] = [];
    const service = Object.create(ServiceService.prototype) as Record<
      string,
      unknown
    >;
    service.companyWorkerRepository = {
      createQueryBuilder: () => queryBuilder(companyWorkers, calls),
    };
    service.workerFeedbackRepository = {
      createQueryBuilder: () => queryBuilder([], calls),
    };
    service.fileUploadService = { getFileUrl: jest.fn() };

    const result = (await (
      service.getWorkersInfoForService as (
        a: { id: number; percentage: number }[],
        c: number,
      ) => Promise<Record<string, unknown>[]>
    ).call(
      service,
      [
        { id: 7, percentage: 40 },
        { id: 8, percentage: 50 },
      ],
      41,
    )) as Record<string, unknown>[];
    return { result, calls };
  }

  it('el join con user es LEFT: el que no tiene cuenta no se cae de la lista', async () => {
    const { calls } = await run([sinCuenta, conCuenta]);
    expect(calls).toContain('leftJoinAndSelect(worker.user)');
    expect(calls).not.toContain('innerJoinAndSelect(worker.user)');
  });

  it('sale con userId y userInfo en null, y el otro igual que siempre', async () => {
    const { result } = await run([sinCuenta, conCuenta]);

    expect(result[0]).toMatchObject({
      workerId: 3,
      userId: null,
      userInfo: null,
    });
    expect(result[1]).toMatchObject({
      workerId: 4,
      userId: 99,
      userInfo: { id: 99, username: 'ana', email: 'ana@x.com' },
    });
  });
});
