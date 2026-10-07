jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));

import { ConflictException } from '@nestjs/common';
import { CompanyService } from './company.service';

/**
 * Restaurar a un trabajador eliminado temporalmente: mientras estuvo fuera su
 * cédula quedó libre, y si otro salón ya la registró no se puede restaurar
 * (serían dos trabajadores activos con la misma cédula).
 */
function setup(takenInCompanies: number[]) {
  const companyWorker = {
    id: 80,
    workerId: 78,
    companyId: 40,
    temporarilyDeleted: true,
    permanentlyDeleted: false,
    isActive: 0,
  };
  const qb: Record<string, jest.Mock> = {};
  for (const m of ['innerJoin', 'select', 'where', 'andWhere']) {
    qb[m] = jest.fn(() => qb);
  }
  qb.getRawMany = jest
    .fn()
    .mockResolvedValue(takenInCompanies.map((companyId) => ({ companyId })));
  const workers = {
    findOne: jest
      .fn()
      .mockResolvedValue({ id: 78, identification: 'V-20111222' }),
    createQueryBuilder: jest.fn(() => qb),
  };
  const companyWorkers = {
    findOne: jest.fn().mockResolvedValue(companyWorker),
    save: jest.fn(),
    manager: { getRepository: jest.fn(() => workers) },
  };

  const service = Object.create(CompanyService.prototype) as Record<
    string,
    unknown
  >;
  Object.assign(service, {
    companyRepository: {
      findOne: jest.fn().mockResolvedValue({ id: 40, userId: 1 }),
    },
    companyWorkerRepository: companyWorkers,
    onboardingService: { safeRecomputeStep: jest.fn() },
  });
  return {
    service: service as unknown as CompanyService,
    companyWorkers,
    companyWorker,
  };
}

describe('restaurar a un trabajador eliminado temporalmente', () => {
  it('si su cédula ya está en otro salón, responde 409 y no lo restaura', async () => {
    const { service, companyWorkers } = setup([41]);

    const error = await service
      .restoreTemporarilyRemovedWorker(1, 80)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({
      code: 'WORKER_IDENTIFICATION_IN_OTHER_COMPANY',
    });
    expect(
      String(
        ((error as ConflictException).getResponse() as { message: string })
          .message,
      ),
    ).toMatch(/^No se puede restaurar: /);
    expect(companyWorkers.save).not.toHaveBeenCalled();
  });

  it('si nadie más la tiene, lo restaura como siempre', async () => {
    const { service, companyWorkers, companyWorker } = setup([]);

    await service.restoreTemporarilyRemovedWorker(1, 80);

    expect(companyWorkers.save).toHaveBeenCalled();
    expect(companyWorker).toMatchObject({
      temporarilyDeleted: false,
      isActive: 1,
    });
  });
});
