import { ConflictException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Worker } from '../../worker/entities/worker.entity';
import { Client } from '../../client/entities/client.entity';
import {
  assertClientIdentificationFree,
  assertWorkerIdentificationFree,
} from './identification-conflict.util';

/**
 * Repositorio falso: registra lo que se le pide al query builder y contesta
 * `exists` a `getExists`.
 */
function fakeRepo<T extends object>(exists: boolean) {
  const calls: { method: string; args: unknown[] }[] = [];
  const qb: Record<string, jest.Mock> = {};
  for (const method of ['innerJoin', 'where', 'andWhere', 'setParameter']) {
    qb[method] = jest.fn((...args: unknown[]) => {
      calls.push({ method, args });
      return qb;
    });
  }
  qb.getExists = jest.fn().mockResolvedValue(exists);
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
