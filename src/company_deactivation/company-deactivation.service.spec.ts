import { NotFoundException } from '@nestjs/common';
import type { DataSource, Repository } from 'typeorm';
import { CompanyDeactivationService } from './company-deactivation.service';
import type { DeactivatedCompaniesService } from './deactivated-companies.service';
import type { ImpersonationService } from '../auth/services/impersonation.service';
import type { RealtimeService } from '../realtime/realtime.service';
import { Company } from '../company/entities/company.entity';
import { Session } from '../session/entities/session.entity';
import { SessionDetail } from '../session_detail/entities/session_detail.entity';

/**
 * El botón del panel. Lo que importa: que desactivar sea idempotente, que
 * cancele SOLO lo que todavía no empezó, que no mande nada a nadie y que saque
 * a quien estaba dentro.
 */

function build(options: {
  exists?: boolean;
  /** Filas que afecta el UPDATE condicional de la company. */
  claimed?: number;
  /** Ids de citas pendientes del salón. */
  pending?: number[];
}) {
  const exists = options.exists ?? true;
  const updates: Array<{ entity: unknown; set: unknown; where?: string }> = [];

  const updateBuilder = (entity: unknown) => {
    const record: { entity: unknown; set: unknown; where?: string } = {
      entity,
      set: null,
    };
    const qb = {
      set: (values: unknown) => {
        record.set = values;
        return qb;
      },
      where: (sql: string) => {
        record.where = sql;
        return qb;
      },
      andWhere: () => qb,
      whereInIds: () => qb,
      execute: () => {
        updates.push(record);
        return Promise.resolve({
          affected: entity === Company ? (options.claimed ?? 1) : 1,
        });
      },
    };
    return qb;
  };

  const selectBuilder = {
    select: () => selectBuilder,
    distinct: () => selectBuilder,
    innerJoin: () => selectBuilder,
    where: () => selectBuilder,
    andWhere: () => selectBuilder,
    getRawMany: () =>
      Promise.resolve((options.pending ?? []).map((id) => ({ id: `${id}` }))),
  };

  const manager = {
    createQueryBuilder: (entity?: unknown) =>
      entity === Session
        ? selectBuilder
        : { update: (target: unknown) => updateBuilder(target) },
  };

  const dataSource = {
    transaction: jest.fn((cb: (m: typeof manager) => unknown) => cb(manager)),
  } as unknown as DataSource;

  const companies = {
    findOne: jest.fn().mockResolvedValue(
      exists
        ? {
            id: 12,
            name: 'Salón Prueba',
            deactivatedAt: new Date('2026-10-28T15:00:00Z'),
            deactivatedBy: 528,
            deactivationReason: 'No pagó',
          }
        : null,
    ),
    createQueryBuilder: () => ({
      update: (target: unknown) => updateBuilder(target),
    }),
  } as unknown as Repository<Company>;

  const revokeForCompany = jest.fn().mockResolvedValue(1);
  const disconnectRoom = jest.fn();
  const refresh = jest.fn().mockResolvedValue(new Set([12]));

  const service = new CompanyDeactivationService(
    dataSource,
    companies,
    { revokeForCompany } as unknown as ImpersonationService,
    { emitToRooms: jest.fn(), disconnectRoom } as unknown as RealtimeService,
    { refresh } as unknown as DeactivatedCompaniesService,
  );

  return { service, updates, revokeForCompany, disconnectRoom, refresh };
}

describe('CompanyDeactivationService.deactivate', () => {
  it('marca el salón, cancela sus citas pendientes y saca a quien estaba dentro', async () => {
    const { service, updates, revokeForCompany, disconnectRoom, refresh } =
      build({ pending: [100, 101] });

    const res = await service.deactivate(12, 528, '  No pagó  ');

    expect(res.cancelledSessions).toBe(2);
    expect(res.active).toBe(false);

    const company = updates.find((u) => u.entity === Company);
    expect(company?.set).toMatchObject({
      deactivatedBy: 528,
      deactivationReason: 'No pagó',
    });
    // Condicional: no pisa una desactivación anterior.
    expect(company?.where).toContain('deactivated_at IS NULL');

    expect(updates.find((u) => u.entity === Session)?.set).toMatchObject({
      sessionStatus: 5,
      cancelledBy: 'system',
    });
    expect(updates.find((u) => u.entity === SessionDetail)?.set).toMatchObject({
      status: 5,
      cancelledBy: 'system',
    });

    expect(refresh).toHaveBeenCalled();
    expect(revokeForCompany).toHaveBeenCalledWith(12);
    expect(disconnectRoom).toHaveBeenCalledWith('company:12');
  });

  it('sin citas pendientes no toca la tabla de citas', async () => {
    const { service, updates } = build({ pending: [] });
    const res = await service.deactivate(12, 528);
    expect(res.cancelledSessions).toBe(0);
    expect(updates.some((u) => u.entity === Session)).toBe(false);
  });

  it('dos clics: el segundo no cancela nada ni vuelve a echar a nadie', async () => {
    const { service, updates, disconnectRoom } = build({
      claimed: 0,
      pending: [100],
    });
    const res = await service.deactivate(12, 528);
    expect(res.cancelledSessions).toBe(0);
    expect(res.message).toMatch(/ya estaba desactivado/);
    expect(updates.some((u) => u.entity === Session)).toBe(false);
    expect(disconnectRoom).not.toHaveBeenCalled();
  });

  it('un motivo en blanco se guarda como null', async () => {
    const { service, updates } = build({});
    await service.deactivate(12, 528, '   ');
    expect(updates.find((u) => u.entity === Company)?.set).toMatchObject({
      deactivationReason: null,
    });
  });

  it('un salón que no existe da 404', async () => {
    const { service } = build({ exists: false });
    await expect(service.deactivate(99, 528)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('si cerrar los accesos falla, la desactivación se mantiene', async () => {
    const { service, revokeForCompany, disconnectRoom } = build({});
    revokeForCompany.mockRejectedValueOnce(new Error('caído'));
    await expect(service.deactivate(12, 528)).resolves.toMatchObject({
      active: false,
    });
    expect(disconnectRoom).toHaveBeenCalled();
  });
});

describe('CompanyDeactivationService.reactivate', () => {
  it('limpia las tres columnas y relee la lista', async () => {
    const { service, updates, refresh } = build({});
    await service.reactivate(12);
    const company = updates.find((u) => u.entity === Company);
    expect(company?.set).toEqual({
      deactivatedAt: null,
      deactivatedBy: null,
      deactivationReason: null,
    });
    expect(company?.where).toContain('deactivated_at IS NOT NULL');
    expect(refresh).toHaveBeenCalled();
  });
});
