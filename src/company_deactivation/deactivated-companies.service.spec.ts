import type { Repository } from 'typeorm';
import { DeactivatedCompaniesService } from './deactivated-companies.service';
import {
  isSilencedByMemberships,
  preferActiveCompany,
} from './company-deactivation.util';
import type { Company } from '../company/entities/company.entity';
import type { CompanyWorker } from '../company_worker/entities/company_worker.entity';
import type { User } from '../user/entities/user.entity';

/**
 * Salón desactivado desde el panel. Lo que se prueba aquí es A QUIÉN se corta
 * y a quién no: el dueño y los trabajadores del salón desactivado sí; el
 * cliente, el `padm` y el trabajador que además está en otro salón activo no.
 */

interface World {
  /** Ids de salones desactivados. */
  deactivated: number[];
  /** companyId -> dueño (user id). */
  owners?: Record<number, number>;
  /** Filas activas de company_worker: [userId, companyId]. */
  workers?: Array<[number, number]>;
  /** email -> user ids. */
  usersByEmail?: Record<string, number[]>;
  /** email -> company ids (correo de facturación del salón). */
  companiesByEmail?: Record<string, number[]>;
}

function build(world: World) {
  let deactivated = [...world.deactivated];
  const loads = { count: 0 };

  const companies = {
    find: jest.fn((opts: { where: Record<string, unknown> }) => {
      const where = opts.where;
      if ('deactivatedAt' in where) {
        loads.count++;
        return Promise.resolve(deactivated.map((id) => ({ id })));
      }
      if ('userId' in where) {
        const ids = Object.entries(world.owners ?? {})
          .filter(([, owner]) => owner === where.userId)
          .map(([id]) => ({ id: Number(id) }));
        return Promise.resolve(ids);
      }
      if ('email' in where) {
        return Promise.resolve(
          (world.companiesByEmail?.[where.email as string] ?? []).map((id) => ({
            id,
          })),
        );
      }
      return Promise.resolve([]);
    }),
  };

  const companyWorkers = {
    find: jest.fn((opts: { where: { userId: number } }) =>
      Promise.resolve(
        (world.workers ?? [])
          .filter(([userId]) => userId === opts.where.userId)
          .map(([, companyId], i) => ({ id: i + 1, companyId })),
      ),
    ),
  };

  const users = {
    find: jest.fn((opts: { where: { email: string } }) =>
      Promise.resolve(
        (world.usersByEmail?.[opts.where.email] ?? []).map((id) => ({ id })),
      ),
    ),
  };

  const service = new DeactivatedCompaniesService(
    companies as unknown as Repository<Company>,
    companyWorkers as unknown as Repository<CompanyWorker>,
    users as unknown as Repository<User>,
  );

  return {
    service,
    companies,
    loads,
    setDeactivated: (ids: number[]) => {
      deactivated = ids;
    },
  };
}

describe('isSilencedByMemberships', () => {
  const off = new Set([10]);

  it('sin ningún salón (cliente) no se silencia', () => {
    expect(isSilencedByMemberships([], off)).toBe(false);
  });

  it('con su único salón desactivado, sí', () => {
    expect(isSilencedByMemberships([10], off)).toBe(true);
  });

  it('con un salón desactivado y otro activo, no', () => {
    expect(isSilencedByMemberships([10, 20], off)).toBe(false);
  });
});

describe('preferActiveCompany', () => {
  const off = new Set([10]);

  it('elige el salón activo aunque venga segundo', () => {
    expect(
      preferActiveCompany([{ companyId: 10 }, { companyId: 20 }], off),
    ).toEqual({ companyId: 20 });
  });

  it('si todos están desactivados devuelve el primero', () => {
    expect(preferActiveCompany([{ companyId: 10 }], off)).toEqual({
      companyId: 10,
    });
  });

  it('sin filas devuelve null', () => {
    expect(preferActiveCompany([], off)).toBeNull();
  });
});

describe('DeactivatedCompaniesService.isSessionBlocked', () => {
  const world: World = {
    deactivated: [10],
    owners: { 10: 1, 20: 2 },
    workers: [
      [3, 10],
      [4, 10],
      [4, 20],
    ],
  };

  it('corta al dueño con token del salón desactivado', async () => {
    const { service } = build(world);
    await expect(
      service.isSessionBlocked({ sub: 1, userType: 'adm', companyId: 10 }),
    ).resolves.toBe(true);
  });

  it('deja pasar al dueño de un salón activo', async () => {
    const { service } = build(world);
    await expect(
      service.isSessionBlocked({ sub: 2, userType: 'adm', companyId: 20 }),
    ).resolves.toBe(false);
  });

  it('corta al trabajador con token del salón desactivado', async () => {
    const { service } = build(world);
    await expect(
      service.isSessionBlocked({ sub: 3, userType: 'wrk', companyId: 10 }),
    ).resolves.toBe(true);
  });

  it('el trabajador de dos salones con token del activo sigue trabajando', async () => {
    const { service } = build(world);
    await expect(
      service.isSessionBlocked({ sub: 4, userType: 'wrk', companyId: 20 }),
    ).resolves.toBe(false);
  });

  it('token viejo sin salón: se decide por la persona', async () => {
    const { service } = build(world);
    await expect(
      service.isSessionBlocked({ sub: 1, userType: 'adm', companyId: null }),
    ).resolves.toBe(true);
    await expect(
      service.isSessionBlocked({ sub: 4, userType: 'wrk', companyId: null }),
    ).resolves.toBe(false);
  });

  it('nunca corta a clientes ni al admin de la plataforma', async () => {
    const { service } = build(world);
    await expect(
      service.isSessionBlocked({ sub: 1, userType: 'cli', companyId: 10 }),
    ).resolves.toBe(false);
    await expect(
      service.isSessionBlocked({ sub: 9, userType: 'padm', companyId: 10 }),
    ).resolves.toBe(false);
  });
});

describe('DeactivatedCompaniesService.isEmailSilenced', () => {
  const world: World = {
    deactivated: [10],
    owners: { 10: 1, 20: 2 },
    usersByEmail: { 'duena@x.com': [1], 'otro@x.com': [2], 'cli@x.com': [7] },
    companiesByEmail: { 'facturacion@x.com': [10] },
  };

  it('silencia el correo de la dueña del salón desactivado', async () => {
    const { service } = build(world);
    await expect(service.isEmailSilenced('duena@x.com')).resolves.toBe(true);
  });

  it('no silencia a la dueña de un salón activo ni a un cliente', async () => {
    const { service } = build(world);
    await expect(service.isEmailSilenced('otro@x.com')).resolves.toBe(false);
    await expect(service.isEmailSilenced('cli@x.com')).resolves.toBe(false);
  });

  it('silencia el correo de facturación del salón desactivado', async () => {
    const { service } = build(world);
    await expect(service.isEmailSilenced('facturacion@x.com')).resolves.toBe(
      true,
    );
  });

  it('un correo vacío o desconocido no se silencia', async () => {
    const { service } = build(world);
    await expect(service.isEmailSilenced('')).resolves.toBe(false);
    await expect(service.isEmailSilenced(null)).resolves.toBe(false);
    await expect(service.isEmailSilenced('nadie@x.com')).resolves.toBe(false);
  });

  it('sin salones desactivados no consulta nada más', async () => {
    const { service, companies } = build({ ...world, deactivated: [] });
    await expect(service.isEmailSilenced('duena@x.com')).resolves.toBe(false);
    // Solo la lectura de la lista; ni usuarios ni salones por correo.
    expect(companies.find).toHaveBeenCalledTimes(1);
  });
});

describe('DeactivatedCompaniesService (memoria)', () => {
  it('lee la lista una vez y la reutiliza', async () => {
    const { service, loads } = build({ deactivated: [10] });
    await service.isCompanyDeactivated(10);
    await service.isCompanyDeactivated(11);
    await service.isCompanyDeactivated(10);
    expect(loads.count).toBe(1);
  });

  it('muchas peticiones a la vez comparten una sola lectura', async () => {
    const { service, loads } = build({ deactivated: [10] });
    await Promise.all([
      service.isCompanyDeactivated(10),
      service.isCompanyDeactivated(10),
      service.isCompanyDeactivated(10),
    ]);
    expect(loads.count).toBe(1);
  });

  it('refresh() ve el cambio al instante, sin esperar el plazo', async () => {
    const { service, setDeactivated } = build({ deactivated: [] });
    await expect(service.isCompanyDeactivated(10)).resolves.toBe(false);
    setDeactivated([10]);
    await service.refresh();
    await expect(service.isCompanyDeactivated(10)).resolves.toBe(true);
  });

  it('una lectura vieja que termina tarde no pisa a la nueva', async () => {
    const { service, companies } = build({ deactivated: [] });
    let releaseOld: (rows: Array<{ id: number }>) => void = () => undefined;
    companies.find.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseOld = resolve;
        }),
    );
    // Lectura vieja: salió ANTES de desactivar, todavía no ve el salón 10.
    const old = service.refresh();
    // El botón desactiva y relee: esta ya lo ve.
    companies.find.mockResolvedValueOnce([{ id: 10 }]);
    await service.refresh();
    releaseOld([]);
    await old;
    await expect(service.isCompanyDeactivated(10)).resolves.toBe(true);
  });

  it('si la lectura falla, sigue con la última lista conocida', async () => {
    const { service, companies } = build({ deactivated: [10] });
    await service.refresh();
    companies.find.mockRejectedValueOnce(new Error('sin base'));
    await service.refresh();
    await expect(service.isCompanyDeactivated(10)).resolves.toBe(true);
  });
});
