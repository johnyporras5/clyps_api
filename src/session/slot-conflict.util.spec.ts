import { ConflictException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import {
  NON_BLOCKING_DETAIL_STATUSES,
  findSlotConflicts,
  lockWorkers,
  slotTakenException,
} from './slot-conflict.util';

/**
 * BE-OFF-2. La comparación de horarios la hace MySQL; aquí se prueba que la
 * consulta pide lo correcto (estados, borde, orden de parámetros) y que la
 * respuesta tiene la forma del ticket.
 */

const at = (iso: string) => new Date(iso);

function manager(rowsPerCall: Array<Array<{ sessionId: number | string }>>) {
  const query = jest.fn();
  rowsPerCall.forEach((rows) => query.mockResolvedValueOnce(rows));
  query.mockResolvedValue([]);
  return { m: { query } as unknown as EntityManager, query };
}

describe('lockWorkers', () => {
  it('bloquea a cada trabajadora una vez y en orden (evita deadlocks)', async () => {
    const { m, query } = manager([]);
    await lockWorkers(m, [13, 1, 13, 7]);
    expect(query).toHaveBeenCalledWith(
      'SELECT id FROM company_worker WHERE id IN (?) ORDER BY id FOR UPDATE',
      [[1, 7, 13]],
    );
  });

  it('sin trabajadoras no bloquea nada', async () => {
    const { m, query } = manager([]);
    await lockWorkers(m, []);
    expect(query).not.toHaveBeenCalled();
  });
});

describe('findSlotConflicts', () => {
  const detail = {
    detailIndex: 0,
    companyWorkerId: 12,
    start: at('2026-11-20T14:00:00.000Z'),
    end: at('2026-11-20T14:45:00.000Z'),
  };

  it('choque: devuelve el detalle con la forma del ticket', async () => {
    const { m } = manager([[{ sessionId: '4821' }]]);
    await expect(findSlotConflicts(m, [detail])).resolves.toEqual([
      {
        detailIndex: 0,
        companyWorkerId: 12,
        startDatetime: '2026-11-20T14:00:00.000Z',
        endDatetime: '2026-11-20T14:45:00.000Z',
        conflictingSessionId: 4821,
      },
    ]);
  });

  it('sin choque: lista vacía', async () => {
    const { m } = manager([[]]);
    await expect(findSlotConflicts(m, [detail])).resolves.toEqual([]);
  });

  it('las canceladas (y completadas/pagadas) no cuentan: mismos estados que availability', async () => {
    const { m, query } = manager([[]]);
    await findSlotConflicts(m, [detail]);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('sd.status NOT IN (?)');
    expect(params[1]).toEqual([3, 4, 5]);
    expect([...NON_BLOCKING_DETAIL_STATUSES]).toContain(5);
  });

  it('tocarse en el borde no choca: comparaciones estrictas [inicio, fin)', async () => {
    const { m, query } = manager([[]]);
    await findSlotConflicts(m, [detail]);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    // existente.inicio < nuevo.fin  Y  existente.fin > nuevo.inicio
    expect(sql).toMatch(/sd\.start_datetime < \?/);
    expect(sql).toMatch(/\) > \?/);
    expect(sql).not.toMatch(/<= \?|>= \?/);
    expect(params[2]).toEqual(detail.end);
    expect(params[3]).toEqual(detail.start);
  });

  it('no filtra por día: una cita que cruza la medianoche también cuenta', async () => {
    const { m, query } = manager([[]]);
    await findSlotConflicts(m, [detail]);
    const [sql] = query.mock.calls[0] as [string];
    expect(sql).not.toMatch(/BETWEEN/i);
    expect(sql).toContain('COALESCE(');
  });

  it('informa TODOS los detalles que chocan, con su posición', async () => {
    const second = {
      ...detail,
      detailIndex: 2,
      companyWorkerId: 13,
      start: at('2026-11-20T15:00:00.000Z'),
      end: at('2026-11-20T15:30:00.000Z'),
    };
    const { m } = manager([[{ sessionId: 1 }], [{ sessionId: 2 }]]);
    const conflicts = await findSlotConflicts(m, [detail, second]);
    expect(conflicts.map((c) => c.detailIndex)).toEqual([0, 2]);
    expect(conflicts.map((c) => c.conflictingSessionId)).toEqual([1, 2]);
  });

  it('un servicio sin duración no ocupa nada', async () => {
    const { m, query } = manager([[{ sessionId: 1 }]]);
    const conflicts = await findSlotConflicts(m, [
      { ...detail, end: detail.start },
    ]);
    expect(conflicts).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });
});

describe('slotTakenException', () => {
  it('409 con code, message y conflicts del ticket', () => {
    const conflicts = [
      {
        detailIndex: 0,
        companyWorkerId: 12,
        startDatetime: '2026-11-20T14:00:00.000Z',
        endDatetime: '2026-11-20T14:45:00.000Z',
        conflictingSessionId: 4821,
      },
    ];
    const error = slotTakenException(conflicts);
    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getStatus()).toBe(409);
    expect(error.getResponse()).toEqual({
      statusCode: 409,
      code: 'SLOT_TAKEN',
      message: 'El trabajador ya tiene una cita en ese horario',
      conflicts,
    });
  });
});
