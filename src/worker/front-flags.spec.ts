jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));

import { WorkerService } from './worker.service';
import { CompanyWorkerService } from '../company_worker/company_worker.service';
import { HideIdentificationInterceptor } from '../common/interceptors/hide-identification.interceptor';
import { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';

/**
 * Dos datos que el front necesita para el cambio de identidad:
 *  - `identificationEnabled` en el perfil del trabajador: si su salón pide la
 *    cédula (al dar de alta un cliente, por ejemplo);
 *  - `hasAccount` en la lista del equipo: para marcar a quien no tiene cuenta.
 */

const original = process.env.LEGACY_IDENTITY_COMPANY_IDS;
beforeEach(() => {
  process.env.LEGACY_IDENTITY_COMPANY_IDS = '12';
});
afterEach(() => {
  if (original === undefined) delete process.env.LEGACY_IDENTITY_COMPANY_IDS;
  else process.env.LEGACY_IDENTITY_COMPANY_IDS = original;
});

function workerService(activeAssignmentCompanyId: number | null) {
  const service = Object.create(WorkerService.prototype) as Record<
    string,
    unknown
  >;
  Object.assign(service, {
    workerRepository: {
      findOne: jest.fn().mockResolvedValue({ id: 3, userId: 9, user: null }),
    },
    companyWorkerRepository: {
      findOne: jest
        .fn()
        .mockResolvedValue(
          activeAssignmentCompanyId === null
            ? null
            : { id: 7, companyId: activeAssignmentCompanyId },
        ),
    },
    getWorkerPhotoUrl: jest.fn().mockResolvedValue(''),
    getFeedbackSummary: jest.fn().mockResolvedValue({}),
  });
  return service as unknown as WorkerService;
}

describe('perfil del trabajador: identificationEnabled', () => {
  it('salón normal (el del token): true', async () => {
    const profile = await workerService(41).findByUserId(9, 41);
    expect(profile.identificationEnabled).toBe(true);
  });

  it('salón excluido (el del token): false, aunque tenga otro normal', async () => {
    const profile = await workerService(41).findByUserId(9, 12);
    expect(profile.identificationEnabled).toBe(false);
  });

  it('sin salón en el token, usa el de su asignación activa', async () => {
    const profile = await workerService(12).findByUserId(9, null);
    expect(profile.identificationEnabled).toBe(false);
  });

  it('el interceptor de los excluidos no lo borra: el front lo necesita', async () => {
    const context = {
      getType: () => 'http',
      switchToHttp: () => ({ getRequest: () => ({ user: { companyId: 12 } }) }),
    } as unknown as ExecutionContext;
    const handler: CallHandler = {
      handle: () => of({ identification: 'V-1', identificationEnabled: false }),
    };

    await expect(
      lastValueFrom(
        new HideIdentificationInterceptor().intercept(context, handler),
      ),
    ).resolves.toEqual({ identificationEnabled: false });
  });
});

describe('lista del equipo: hasAccount', () => {
  async function list(rows: { workerId: number; userId: number | null }[]) {
    const qb: Record<string, jest.Mock> = {};
    for (const m of [
      'innerJoin',
      'leftJoin',
      'select',
      'where',
      'andWhere',
      'groupBy',
      'addGroupBy',
      'orderBy',
    ]) {
      qb[m] = jest.fn(() => qb);
    }
    const service = Object.create(CompanyWorkerService.prototype) as Record<
      string,
      unknown
    >;
    Object.assign(service, {
      companyRepository: { findOne: jest.fn().mockResolvedValue({ id: 41 }) },
      workerRepository: { createQueryBuilder: () => qb },
      fileUploadService: { getFileUrl: jest.fn() },
      paginateQueryBuilder: jest.fn().mockResolvedValue({
        data: rows.map((r) => ({
          ...r,
          averageRating: '0',
          totalReviews: '0',
          calendar: null,
        })),
        meta: {},
      }),
    });
    const result = await (
      service as unknown as CompanyWorkerService
    ).getCompanyWorkersWithNameFilterPaginated(1, {} as never);
    return { result, select: qb.select };
  }

  it('marca quién tiene cuenta y quién no', async () => {
    const { result } = await list([
      { workerId: 3, userId: null },
      { workerId: 4, userId: 99 },
    ]);
    expect(result.data.map((w) => [w.workerId, w.hasAccount])).toEqual([
      [3, false],
      [4, true],
    ]);
  });

  it('lo saca de worker.user_id en la misma consulta', async () => {
    const { select } = await list([]);
    expect(select).toHaveBeenCalledWith(
      expect.arrayContaining(['worker.user_id AS userId']),
    );
  });
});
