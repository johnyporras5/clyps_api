import { EntityManager } from 'typeorm';
import {
  generateUniqueWorkerSlug,
  slugifyWorkerName,
} from './company-worker-slug.util';

describe('slugifyWorkerName', () => {
  it('quita acentos y espacios', () => {
    expect(slugifyWorkerName('Ana Torres Pérez')).toBe('ana-torres-perez');
  });

  it('usa "profesional" si no hay nombre', () => {
    expect(slugifyWorkerName(null)).toBe('profesional');
  });
});

describe('generateUniqueWorkerSlug', () => {
  // taken: pares "companyId:slug" ya usados.
  const managerWith = (taken: string[]) =>
    ({
      findOne: jest.fn(
        (
          _entity: unknown,
          { where }: { where: { companyId: number; slug: string } },
        ) =>
          Promise.resolve(
            taken.includes(`${where.companyId}:${where.slug}`)
              ? { id: 1 }
              : null,
          ),
      ),
    }) as unknown as EntityManager;

  it('el mismo nombre en OTRO negocio no choca', async () => {
    await expect(
      generateUniqueWorkerSlug(managerWith(['1:ana-torres']), 2, 'Ana Torres'),
    ).resolves.toBe('ana-torres');
  });

  it('en el mismo negocio agrega sufijo', async () => {
    await expect(
      generateUniqueWorkerSlug(managerWith(['1:ana-torres']), 1, 'Ana Torres'),
    ).resolves.toBe('ana-torres-2');
  });
});
