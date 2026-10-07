import { BadRequestException, ConflictException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Worker } from '../../worker/entities/worker.entity';
import { Client } from '../../client/entities/client.entity';
import {
  assertClientIdentificationFree,
  assertIdentificationNotRemoved,
  assertWorkerIdentificationFree,
} from './identification-conflict.util';

/**
 * Repositorio falso: registra lo que se le pide al query builder y contesta
 * `exists` a `getExists` (clientes). A `getRawMany` (trabajadores) contesta
 * los salones donde ya está la cédula: `takenIn`, o el 7 si `exists`.
 */
function fakeRepo<T extends object>(exists: boolean, takenIn?: number[]) {
  const calls: { method: string; args: unknown[] }[] = [];
  const qb: Record<string, jest.Mock> = {};
  for (const method of [
    'innerJoin',
    'select',
    'where',
    'andWhere',
    'setParameter',
  ]) {
    qb[method] = jest.fn((...args: unknown[]) => {
      calls.push({ method, args });
      return qb;
    });
  }
  qb.getExists = jest.fn().mockResolvedValue(exists);
  qb.getRawMany = jest
    .fn()
    .mockResolvedValue(
      (takenIn ?? (exists ? [7] : [])).map((companyId) => ({ companyId })),
    );
  const createQueryBuilder = jest.fn(() => qb);
  const repo = {
    createQueryBuilder,
  } as unknown as Repository<T>;
  return { repo, calls, createQueryBuilder };
}

describe('cédula repetida dentro del salón', () => {
  describe('trabajador', () => {
    it('sin cédula no consulta nada', async () => {
      const { repo, createQueryBuilder } = fakeRepo<Worker>(true);
      await assertWorkerIdentificationFree(repo, null, [7]);
      await assertWorkerIdentificationFree(repo, undefined, [7]);
      expect(createQueryBuilder).not.toHaveBeenCalled();
    });

    it('sin salones no hay con quién chocar', async () => {
      const { repo, createQueryBuilder } = fakeRepo<Worker>(true);
      await assertWorkerIdentificationFree(repo, 'V-12345678', []);
      expect(createQueryBuilder).not.toHaveBeenCalled();
    });

    it('si otro trabajador del salón la tiene, responde 409 con su código', async () => {
      const { repo } = fakeRepo<Worker>(true);
      const error = await assertWorkerIdentificationFree(
        repo,
        'V-12345678',
        [7],
      ).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({
        code: 'IDENTIFICATION_ALREADY_IN_COMPANY',
      });
    });

    it('si nadie la tiene, pasa', async () => {
      const { repo } = fakeRepo<Worker>(false);
      await expect(
        assertWorkerIdentificationFree(repo, 'V-12345678', [7]),
      ).resolves.toBeUndefined();
    });

    it('al editar, se excluye a sí mismo', async () => {
      const { repo, calls } = fakeRepo<Worker>(false);
      await assertWorkerIdentificationFree(repo, 'V-12345678', [7], 42);
      expect(calls).toContainEqual({
        method: 'andWhere',
        args: ['worker.id <> :excludeWorkerId', { excludeWorkerId: 42 }],
      });
    });

    it('busca en todos los salones, no solo en el suyo', async () => {
      const { repo, calls } = fakeRepo<Worker>(false);
      await assertWorkerIdentificationFree(repo, 'V-12345678', [7]);
      expect(
        calls.some((c) => String(c.args[0]).includes('cw.company_id IN')),
      ).toBe(false);
    });

    it('si la tiene un trabajador de otro salón, responde 409 con otro código', async () => {
      const { repo } = fakeRepo<Worker>(true, [555]);
      const error = await assertWorkerIdentificationFree(
        repo,
        'V-12345678',
        [7],
      ).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({
        code: 'WORKER_IDENTIFICATION_IN_OTHER_COMPANY',
      });
      // No dice de qué salón es.
      expect(
        JSON.stringify((error as ConflictException).getResponse()),
      ).not.toContain('555');
    });

    it('si está en el suyo y en otro, gana el aviso de su salón', async () => {
      const { repo } = fakeRepo<Worker>(true, [9, 7]);
      const error = await assertWorkerIdentificationFree(
        repo,
        'V-12345678',
        [7],
      ).catch((e: unknown) => e);
      expect((error as ConflictException).getResponse()).toMatchObject({
        code: 'IDENTIFICATION_ALREADY_IN_COMPANY',
      });
    });

    it('no cuenta a los borrados para siempre de su salón', async () => {
      const { repo, calls } = fakeRepo<Worker>(false);
      await assertWorkerIdentificationFree(repo, 'V-12345678', [7]);
      expect(calls).toContainEqual({
        method: 'andWhere',
        args: ['cw.permanently_deleted = 0'],
      });
    });
  });

  describe('cliente', () => {
    it('busca en cada salón dentro del JSON companies', async () => {
      const { repo, calls } = fakeRepo<Client>(false);
      await assertClientIdentificationFree(repo, 'V-12345678', [3, 9]);

      expect(calls).toContainEqual({
        method: 'setParameter',
        args: ['idCid0', '3'],
      });
      expect(calls).toContainEqual({
        method: 'setParameter',
        args: ['idCid1', '9'],
      });
    });

    it('no cuenta a los borrados para siempre', async () => {
      const { repo, calls } = fakeRepo<Client>(false);
      await assertClientIdentificationFree(repo, 'V-12345678', [3]);
      expect(calls).toContainEqual({
        method: 'andWhere',
        args: ['client.permanently_deleted = 0'],
      });
    });

    it('si otro cliente del salón la tiene, responde 409', async () => {
      const { repo } = fakeRepo<Client>(true);
      await expect(
        assertClientIdentificationFree(repo, 'V-12345678', [3], 5),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('salones excluidos del cambio de identidad', () => {
    const original = process.env.LEGACY_IDENTITY_COMPANY_IDS;
    beforeEach(() => {
      process.env.LEGACY_IDENTITY_COMPANY_IDS = '12';
    });
    afterEach(() => {
      if (original === undefined)
        delete process.env.LEGACY_IDENTITY_COMPANY_IDS;
      else process.env.LEGACY_IDENTITY_COMPANY_IDS = original;
    });

    it('en un salón excluido no se revisa nada', async () => {
      const { repo, createQueryBuilder } = fakeRepo<Worker>(true);
      await assertWorkerIdentificationFree(repo, 'V-12345678', [12]);
      expect(createQueryBuilder).not.toHaveBeenCalled();
    });

    it('si está en uno excluido y en uno normal, solo mira el normal', async () => {
      const { repo, calls } = fakeRepo<Client>(false);
      await assertClientIdentificationFree(repo, 'V-12345678', [12, 41]);

      const params = calls.filter((c) => c.method === 'setParameter');
      expect(params).toEqual([
        { method: 'setParameter', args: ['idCid0', '41'] },
      ]);
    });
  });
});

describe('la cédula se cambia pero no se quita', () => {
  it('vaciar una que ya existe responde 400 con su código', () => {
    let error: unknown;
    try {
      assertIdentificationNotRemoved('V-12345678', null);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      code: 'IDENTIFICATION_CANNOT_BE_REMOVED',
    });
  });

  it('una cadena vacía cuenta igual que null', () => {
    expect(() => assertIdentificationNotRemoved('V-12345678', '')).toThrow(
      BadRequestException,
    );
  });

  it('cambiarla por otra pasa', () => {
    expect(() =>
      assertIdentificationNotRemoved('V-12345678', 'E-12345678'),
    ).not.toThrow();
  });

  it('si no viene en la edición, no se toca', () => {
    expect(() =>
      assertIdentificationNotRemoved('V-12345678', undefined),
    ).not.toThrow();
  });

  it('una ficha vieja sin cédula se sigue guardando vacía', () => {
    expect(() => assertIdentificationNotRemoved(null, null)).not.toThrow();
    expect(() => assertIdentificationNotRemoved(undefined, null)).not.toThrow();
  });
});
