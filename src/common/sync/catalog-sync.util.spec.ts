import { BadRequestException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import {
  CATALOG_DELETION_RETENTION_DAYS,
  SERVER_TIME_MARGIN_SECONDS,
  deletedIdsSince,
  getServerTime,
  purgeCatalogDeletions,
  recordCatalogDeletion,
  resolveSince,
  syncFields,
  toUtcSql,
} from './catalog-sync.util';

/** BE-OFF-4: `?since=` en los catálogos. */
const NOW = new Date('2026-11-20T20:00:00.000Z');

const manager = (result: unknown) => {
  const query = jest.fn().mockResolvedValue(result);
  return { m: { query } as unknown as EntityManager, query };
};

describe('resolveSince', () => {
  it.each([undefined, null, ''])(
    'sin since (%p): respuesta de siempre',
    (v) => {
      expect(resolveSince(v, NOW)).toEqual({ since: null, fullSync: false });
    },
  );

  it('acepta la serverTime que devolvió el servidor', () => {
    expect(resolveSince('2026-11-19T12:00:00.000Z', NOW)).toEqual({
      since: new Date('2026-11-19T12:00:00.000Z'),
      fullSync: false,
    });
  });

  it.each(['2026-11-19 12:00:00', '2026-11-19T12:00:00-04:00', 'ayer', '1'])(
    'formato inválido (%p): 400 SINCE_INVALID',
    (v) => {
      let error: unknown;
      try {
        resolveSince(v, NOW);
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: 'SINCE_INVALID',
      });
    },
  );

  it(`más viejo que ${CATALOG_DELETION_RETENTION_DAYS} días: sin filtro y fullSync`, () => {
    const old = new Date(
      NOW.getTime() - (CATALOG_DELETION_RETENTION_DAYS + 1) * 86_400_000,
    ).toISOString();
    expect(resolveSince(old, NOW)).toEqual({ since: null, fullSync: true });
  });
});

describe('toUtcSql', () => {
  it('va en UTC, sin T ni Z (nunca la hora de Caracas)', () => {
    expect(toUtcSql(new Date('2026-11-20T19:56:39.123Z'))).toBe(
      '2026-11-20 19:56:39.123',
    );
  });
});

describe('getServerTime', () => {
  it('sale del reloj de la base, con el margen, en ISO con Z', async () => {
    const { m, query } = manager([{ t: '2026-11-20 19:55:39.123000' }]);
    await expect(getServerTime(m)).resolves.toBe('2026-11-20T19:55:39.123Z');
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('UTC_TIMESTAMP(3) - INTERVAL ? SECOND');
    expect(params).toEqual([SERVER_TIME_MARGIN_SECONDS]);
  });
});

describe('borrados', () => {
  it('anota el borrado con su salón', async () => {
    const { m, query } = manager(undefined);
    await recordCatalogDeletion(m, 1, 'service', 25);
    expect(query).toHaveBeenCalledWith(
      'INSERT INTO catalog_deletion (company_id, entity, entity_id) VALUES (?, ?, ?)',
      [1, 'service', 25],
    );
  });

  it('devuelve los ids borrados después de since, solo de esos salones', async () => {
    const { m, query } = manager([{ entityId: '25' }, { entityId: 31 }]);
    const ids = await deletedIdsSince(
      m,
      [1],
      'service',
      new Date('2026-11-19T12:00:00.000Z'),
    );
    expect(ids).toEqual([25, 31]);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('company_id IN (?)');
    expect(params).toEqual([[1], 'service', '2026-11-19 12:00:00.000']);
  });

  it('sin salones no consulta', async () => {
    const { m, query } = manager([]);
    await expect(deletedIdsSince(m, [], 'service', NOW)).resolves.toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it(`la limpieza borra los de más de ${CATALOG_DELETION_RETENTION_DAYS} días`, async () => {
    const { m, query } = manager({ affectedRows: 3 });
    await expect(purgeCatalogDeletions(m)).resolves.toBe(3);
    expect(query.mock.calls[0][1]).toEqual([CATALOG_DELETION_RETENTION_DAYS]);
  });
});

describe('syncFields', () => {
  const T = '2026-11-20T19:55:39.123Z';

  it('sin since: solo serverTime (lo demás de la respuesta no cambia)', () => {
    expect(syncFields(T, { since: null, fullSync: false })).toEqual({
      serverTime: T,
    });
  });

  it('con since: serverTime y los ids borrados', () => {
    expect(syncFields(T, { since: NOW, fullSync: false }, [25])).toEqual({
      serverTime: T,
      deletedIds: [25],
    });
  });

  it('since muy viejo: fullSync, sin deletedIds', () => {
    expect(syncFields(T, { since: null, fullSync: true }, undefined)).toEqual({
      serverTime: T,
      fullSync: true,
    });
  });
});
