jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));

import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { EntityManager, Repository } from 'typeorm';
import { EntitlementsService } from './entitlements.service';
import { WorkersSelectionService } from './workers-selection.service';
import type { SubscriptionService } from './subscription.service';
import type { Company } from '../company/entities/company.entity';
import type { CompanyWorker } from '../company_worker/entities/company_worker.entity';
import type { Client } from '../client/entities/client.entity';
import type { ClientFavoriteCompany } from '../client_favorite_company/entities/client-favorite-company.entity';
import type { PaymentReport } from './entities/payment-report.entity';
import type { Subscription } from './entities/subscription.entity';
import type { PlanId } from './config/plans.config';
import type { FileUploadService } from '../common/services/file_upload.service';
import type { AccessResponse } from './dto/access-response.dto';
import { SessionDetailSubscriber } from '../session/session-detail.subscriber';
import type { DataSource, InsertEvent, UpdateEvent } from 'typeorm';
import type { SessionDetail } from '../session_detail/entities/session_detail.entity';

/**
 * Selección de trabajadores al terminar la prueba: un salón con más
 * trabajadores de los que admite su plan escoge con cuáles se queda, y el
 * resto queda suspendido (no borrado) hasta que pague el Full.
 */

function days(n: number): Date {
  return new Date(Date.now() + n * 24 * 60 * 60 * 1000);
}

function entitlements(options: {
  planId?: PlanId;
  workers: number;
  trialEndsAt?: Date | null;
  currentPeriodEnd?: Date | null;
  graceEndsAt?: Date | null;
  pendingReports?: number;
  /** El plan del último pago verificado. Sin él, manda la suscripción. */
  paidPlanId?: PlanId;
}): EntitlementsService {
  const subscription = {
    id: 1,
    companyId: 7,
    planId: options.planId ?? 'basico',
    status: 'active',
    trialEndsAt: options.trialEndsAt ?? days(-1),
    currentPeriodEnd:
      'currentPeriodEnd' in options
        ? (options.currentPeriodEnd ?? null)
        : days(20),
    graceEndsAt: options.graceEndsAt ?? null,
    billingExempt: false,
  } as Subscription;

  return new EntitlementsService(
    {
      findOne: jest.fn().mockResolvedValue(subscription),
    } as unknown as Repository<Subscription>,
    {
      countBy: jest.fn().mockResolvedValue(options.pendingReports ?? 0),
      findOne: jest
        .fn()
        .mockResolvedValue(
          options.paidPlanId ? { id: 1, planId: options.paidPlanId } : null,
        ),
    } as unknown as Repository<PaymentReport>,
    {
      countBy: jest.fn().mockResolvedValue(options.workers),
    } as unknown as Repository<CompanyWorker>,
    {
      findOne: jest.fn().mockResolvedValue({ id: 7 }),
    } as unknown as Repository<Company>,
    { findOne: jest.fn() } as unknown as Repository<Client>,
    { find: jest.fn() } as unknown as Repository<ClientFavoriteCompany>,
    { get: () => '0' } as unknown as ConfigService,
    { ensureSubscription: jest.fn() } as unknown as SubscriptionService,
  );
}

async function forbiddenBody(promise: Promise<unknown>) {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ForbiddenException);
  return (error as ForbiddenException).getResponse() as Record<string, unknown>;
}

describe('cuándo hay que escoger trabajadores', () => {
  it('Básico con 3 trabajadores, prueba terminada: bloquea hasta escoger', async () => {
    const service = entitlements({ planId: 'basico', workers: 3 });

    expect(await service.canOperate(7)).toBe(false);
    const body = await forbiddenBody(service.assertCanOperate(7));
    expect(body).toMatchObject({
      reason: 'workers_selection_required',
      blockedFor: 'adm',
      limit: 2,
      current: 3,
    });

    const access = await service.getAccessResponse(7);
    expect(access.canOperate).toBe(true);
    expect(access.workersSelectionRequired).toBe(true);
    expect(access.limits.canAddWorker).toBe(false);
  });

  it('al trabajador no se le habla del plan', async () => {
    const service = entitlements({ planId: 'basico', workers: 3 });

    const body = await forbiddenBody(service.assertCanOperate(7, 'wrk'));
    expect(body).toEqual({
      message: expect.stringContaining('administrador') as unknown,
      reason: 'workers_selection_required',
      blockedFor: 'wrk',
    });
  });

  it('Básico con exactamente 2: no hay nada que escoger', async () => {
    const service = entitlements({ planId: 'basico', workers: 2 });

    expect(await service.canOperate(7)).toBe(true);
    expect((await service.getAccessResponse(7)).workersSelectionRequired).toBe(
      false,
    );
  });

  it('durante la prueba nunca, aunque ya haya pagado el Básico', async () => {
    const service = entitlements({
      planId: 'basico',
      workers: 5,
      trialEndsAt: days(5),
    });

    expect(await service.canOperate(7)).toBe(true);
    expect((await service.getAccessResponse(7)).workersSelectionRequired).toBe(
      false,
    );
  });

  it('si además debe, primero se le pide pagar', async () => {
    const service = entitlements({
      planId: 'basico',
      workers: 5,
      currentPeriodEnd: null,
    });

    const body = await forbiddenBody(service.assertCanOperate(7));
    expect(body.reason).toBe('subscription_blocked');
  });

  it('en la gracia no: es el tiempo para pagar, no un plan nuevo', async () => {
    // Se le venció el mes y todavía no paga. La selección sale cuando entre
    // un pago, nunca por estar en gracia.
    const service = entitlements({
      planId: 'basico',
      workers: 5,
      currentPeriodEnd: days(-1),
      graceEndsAt: days(4),
    });

    expect(await service.canOperate(7)).toBe(true);
    expect((await service.getAccessResponse(7)).workersSelectionRequired).toBe(
      false,
    );
  });

  it('con el pago reportado y sin verificar sí: ya pagó', async () => {
    const service = entitlements({
      planId: 'basico',
      workers: 5,
      currentPeriodEnd: days(-10),
      pendingReports: 1,
    });

    const access = await service.getAccessResponse(7);
    expect(access.graceCause).toBe('pending_report');
    expect(access.workersSelectionRequired).toBe(true);
  });

  it('el Full también: 21 trabajadores piden escoger, 20 no', async () => {
    expect(
      await entitlements({ planId: 'full', workers: 21 }).canOperate(7),
    ).toBe(false);
    expect(
      await entitlements({ planId: 'full', workers: 20 }).canOperate(7),
    ).toBe(true);
  });

  it('el estado para el trabajador lo dice con su motivo', async () => {
    const service = entitlements({ planId: 'basico', workers: 3 });

    expect(await service.getStatusResponse(7, 'wrk')).toMatchObject({
      canOperate: false,
      blockedFor: 'wrk',
      reason: 'workers_selection_required',
    });
  });
});

describe('elegir un plan no cambia nada; pagarlo sí', () => {
  it('en gracia con el Básico, elegir el Full NO le da el Full hasta pagarlo', async () => {
    const service = entitlements({
      planId: 'full', // lo que eligió para el próximo cobro
      paidPlanId: 'basico', // lo último que pagó
      workers: 2,
      currentPeriodEnd: days(-1),
      graceEndsAt: days(4),
    });

    const access = await service.getAccessResponse(7);
    expect(access.planId).toBe('basico');
    expect(access.limits.maxWorkers).toBe(2);
    expect(access.features.payroll).toBe(false);
    expect(access.purchasedPlanId).toBe('basico');
    expect(access.nextPlanId).toBe('full');
  });

  it('si no paga y se acaba la gracia, se bloquea con su plan anterior', async () => {
    const service = entitlements({
      planId: 'full',
      paidPlanId: 'basico',
      workers: 2,
      currentPeriodEnd: days(-10),
    });

    const access = await service.getAccessResponse(7);
    expect(access.canOperate).toBe(false);
    expect(access.planId).toBe('basico');
  });

  it('verificado el pago del Full, pasa al Full', async () => {
    const service = entitlements({
      planId: 'full',
      paidPlanId: 'full',
      workers: 2,
    });

    const access = await service.getAccessResponse(7);
    expect(access.planId).toBe('full');
    expect(access.features.payroll).toBe(true);
    expect(access.nextPlanId).toBeNull();
  });

  it('bajar del Full al Básico tampoco: sigue en Full y no pide escoger hasta pagar', async () => {
    const service = entitlements({
      planId: 'basico',
      paidPlanId: 'full',
      workers: 5,
      currentPeriodEnd: days(-1),
      graceEndsAt: days(4),
    });

    const access = await service.getAccessResponse(7);
    expect(access.planId).toBe('full');
    expect(access.workersSelectionRequired).toBe(false);
    expect(access.nextPlanId).toBe('basico');
  });
});

describe('reactivar a mano', () => {
  it('un suspendido por el plan no se reactiva con el botón', async () => {
    const service = entitlements({ planId: 'basico', workers: 1 });

    const body = await forbiddenBody(
      service.assertCanActivateWorker(7, { planSuspended: true }),
    );
    expect(body.reason).toBe('worker_plan_suspended');
  });

  it('un inactivo cualquiera no puede pasarse del tope', async () => {
    const service = entitlements({ planId: 'basico', workers: 2 });

    const body = await forbiddenBody(
      service.assertCanActivateWorker(7, { planSuspended: false }),
    );
    expect(body.reason).toBe('plan_limit_reached');
  });

  it('con lugar libre se reactiva', async () => {
    const service = entitlements({ planId: 'basico', workers: 1 });

    await expect(
      service.assertCanActivateWorker(7, { planSuspended: false }),
    ).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------

function access(overrides: Partial<AccessResponse> = {}): AccessResponse {
  return {
    planId: 'basico',
    planName: 'Básico',
    canOperate: true,
    workersSelectionRequired: true,
    limits: { maxWorkers: 2, workersInUse: 5, canAddWorker: false },
    ...overrides,
  } as AccessResponse;
}

/** El UPDATE por QueryBuilder (inactivos), con sus llamadas a la vista. */
function updateQb() {
  const qb: Record<string, jest.Mock> = {};
  for (const m of ['update', 'set', 'where', 'andWhere'])
    qb[m] = jest.fn(() => qb);
  qb.execute = jest.fn().mockResolvedValue({ affected: 1 });
  return qb;
}

function selection(
  options: {
    access?: AccessResponse;
    candidates?: number[];
    suspended?: number[];
  } = {},
) {
  const candidates = (options.candidates ?? [10, 11, 12, 13, 14]).map((id) => ({
    id,
    workerId: id + 100,
    worker: { name: `T${id}` },
  }));
  const txQb = updateQb();
  const repoQb = updateQb();
  const tx = {
    find: jest.fn().mockResolvedValue(candidates),
    update: jest.fn().mockResolvedValue(undefined),
    createQueryBuilder: jest.fn(() => txQb),
  };
  const repo = {
    find: jest
      .fn()
      .mockImplementation(({ where }) =>
        Promise.resolve(
          where.planSuspended
            ? (options.suspended ?? []).map((id) => ({ id }))
            : candidates,
        ),
      ),
    findAndCount: jest
      .fn()
      .mockImplementation(({ skip, take }: { skip: number; take: number }) =>
        Promise.resolve([
          candidates.slice(skip, skip + take),
          candidates.length,
        ]),
      ),
    update: jest.fn().mockResolvedValue(undefined),
    createQueryBuilder: jest.fn(() => repoQb),
    manager: {
      transaction: jest.fn((cb: (m: unknown) => unknown) => cb(tx)),
      getRepository: jest.fn(() => ({
        createQueryBuilder: jest.fn(() => {
          const qb: Record<string, jest.Mock> = {};
          for (const m of [
            'select',
            'addSelect',
            'where',
            'andWhere',
            'groupBy',
          ])
            qb[m] = jest.fn(() => qb);
          qb.getRawMany = jest.fn().mockResolvedValue([]);
          return qb;
        }),
      })),
    },
  };
  const ent = {
    getAccessResponse: jest.fn().mockResolvedValue(options.access ?? access()),
    invalidate: jest.fn(),
  };
  const service = new WorkersSelectionService(
    repo as unknown as Repository<CompanyWorker>,
    ent as unknown as EntitlementsService,
    { getFileUrl: jest.fn() } as unknown as FileUploadService,
  );
  return { service, tx, repo, ent, txQb, repoQb };
}

describe('la lista de candidatos viene por páginas', () => {
  it('trae la página pedida y dice si hay más', async () => {
    const { service } = selection();

    const first = await service.getSelection(7, { page: 1, limit: 2 });
    expect(first.workers.map((w) => w.companyWorkerId)).toEqual([10, 11]);
    expect(first.meta).toMatchObject({ total: 5, hasNext: true });

    const last = await service.getSelection(7, { page: 3, limit: 2 });
    expect(last.workers.map((w) => w.companyWorkerId)).toEqual([14]);
    expect(last.meta).toMatchObject({ total: 5, hasNext: false });
  });

  it('sin página pedida trae las primeras 20', async () => {
    const { service, repo } = selection();

    await service.getSelection(7);

    expect(repo.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 20, order: { id: 'ASC' } }),
    );
  });
});

describe('escoger con quiénes se queda', () => {
  it('suspende a todos los que no escogió y nadie se borra', async () => {
    const { service, tx, ent } = selection();

    await service.select(7, [11, 13]);

    expect(tx.update).toHaveBeenCalledTimes(1);
    const [, criteria, values] = tx.update.mock.calls[0] as [
      unknown,
      { id: { _value: number[] } },
      unknown,
    ];
    expect(criteria.id._value).toEqual([10, 12, 14]);
    expect(values).toEqual({ planSuspended: true });
    expect(ent.invalidate).toHaveBeenCalledWith(7);
  });

  it('los inactivos (sin borrar) también quedan suspendidos', async () => {
    const { service, txQb } = selection();

    await service.select(7, [11, 13]);

    expect(txQb.set).toHaveBeenCalledWith({ planSuspended: true });
    expect(txQb.andWhere).toHaveBeenCalledWith(
      '(is_active IS NULL OR is_active <> 1)',
    );
    expect(txQb.execute).toHaveBeenCalledTimes(1);
  });

  it('tiene que escoger exactamente el tope', async () => {
    const { service, tx } = selection();

    await expect(service.select(7, [11])).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.select(7, [10, 11, 12])).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(tx.update).not.toHaveBeenCalled();
  });

  it('un repetido no cuenta como dos', async () => {
    const { service } = selection();

    await expect(service.select(7, [11, 11])).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('un trabajador de otro salón se rechaza', async () => {
    const { service, tx } = selection();

    await expect(service.select(7, [11, 999])).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(tx.update).not.toHaveBeenCalled();
  });

  it('la elección es fija: si ya cabe, no se puede volver a escoger', async () => {
    const { service, tx } = selection({
      access: access({ workersSelectionRequired: false }),
    });

    await expect(service.select(7, [10, 11])).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(tx.update).not.toHaveBeenCalled();
  });

  it('dos envíos a la vez: el segundo ve que ya cabe y no suspende a nadie', async () => {
    const { service, tx } = selection({ candidates: [11, 13] });

    await expect(service.select(7, [10, 12])).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(tx.update).not.toHaveBeenCalled();
  });
});

describe('vuelven solos al pagar el Full', () => {
  it('pagar el Full los reactiva, los más antiguos primero hasta el tope', async () => {
    const { service, repo } = selection({
      access: access({
        planId: 'full',
        planName: 'Full',
        workersSelectionRequired: false,
        limits: { maxWorkers: 20, workersInUse: 2, canAddWorker: true },
      }),
      suspended: [10, 12, 14],
    });

    expect(await service.restoreSuspended(7)).toEqual([10, 12, 14]);
    expect(repo.find).toHaveBeenCalledWith(
      expect.objectContaining({ take: 18, order: { id: 'ASC' } }),
    );
    expect(repo.update).toHaveBeenCalledWith(expect.anything(), {
      planSuspended: false,
    });
  });

  it('pagar el Full también devuelve a los inactivos, que vuelven inactivos', async () => {
    const { service, repoQb } = selection({
      access: access({
        planId: 'full',
        planName: 'Full',
        workersSelectionRequired: false,
        limits: { maxWorkers: 20, workersInUse: 20, canAddWorker: false },
      }),
    });

    await service.restoreSuspended(7);

    // Aunque el tope esté lleno: los inactivos no ocupan lugar.
    expect(repoQb.set).toHaveBeenCalledWith({ planSuspended: false });
    expect(repoQb.andWhere).toHaveBeenCalledWith(
      '(is_active IS NULL OR is_active <> 1)',
    );
  });

  it('renovar el Básico no trae a nadie, aunque haya un hueco', async () => {
    const { service, repo } = selection({
      access: access({
        workersSelectionRequired: false,
        limits: { maxWorkers: 2, workersInUse: 1, canAddWorker: true },
      }),
      suspended: [10],
    });

    expect(await service.restoreSuspended(7)).toEqual([]);
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('un fallo al reactivar no rompe la verificación del pago', async () => {
    const { service, ent } = selection();
    ent.getAccessResponse.mockRejectedValue(new Error('BD caída'));

    await expect(
      service.onActivated({ companyId: 7 } as never),
    ).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------

describe('citas nuevas con un suspendido', () => {
  function subscriber(planSuspended: boolean) {
    const manager = {
      findOne: jest.fn().mockResolvedValue({ id: 12, planSuspended }),
    };
    const sub = new SessionDetailSubscriber({
      subscribers: [],
    } as unknown as DataSource);
    return { sub, manager: manager as unknown as EntityManager };
  }

  it('crear una cita con un suspendido se rechaza', async () => {
    const { sub, manager } = subscriber(true);

    const error = await sub
      .beforeInsert({
        manager,
        entity: { companyWorkerId: 12 },
      } as InsertEvent<SessionDetail>)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ForbiddenException);
    expect((error as ForbiddenException).getResponse()).toMatchObject({
      reason: 'worker_plan_suspended',
    });
  });

  it('con un trabajador normal pasa', async () => {
    const { sub, manager } = subscriber(false);

    await expect(
      sub.beforeInsert({
        manager,
        entity: { companyWorkerId: 12 },
      } as InsertEvent<SessionDetail>),
    ).resolves.toBeUndefined();
  });

  it('una cita sin trabajador no consulta nada', async () => {
    const { sub, manager } = subscriber(true);
    const findOne = jest.spyOn(manager, 'findOne');

    await sub.beforeInsert({
      manager,
      entity: { companyWorkerId: null },
    } as unknown as InsertEvent<SessionDetail>);
    expect(findOne).not.toHaveBeenCalled();
  });

  it('tocar una cita que YA tenía (mismo trabajador) sigue su curso', async () => {
    const { sub, manager } = subscriber(true);

    await expect(
      sub.beforeUpdate({
        manager,
        entity: { companyWorkerId: 12, status: 3 },
        databaseEntity: { companyWorkerId: 12 },
      } as unknown as UpdateEvent<SessionDetail>),
    ).resolves.toBeUndefined();
  });

  it('pasarle una cita de otro a un suspendido se rechaza', async () => {
    const { sub, manager } = subscriber(true);

    await expect(
      sub.beforeUpdate({
        manager,
        entity: { companyWorkerId: 12 },
        databaseEntity: { companyWorkerId: 5 },
      } as unknown as UpdateEvent<SessionDetail>),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
