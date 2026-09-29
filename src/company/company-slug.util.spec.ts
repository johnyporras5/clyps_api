import { EntityManager } from 'typeorm';
import {
  generateUniqueCompanySlug,
  slugifyCompanyName,
} from './company-slug.util';

describe('slugifyCompanyName', () => {
  it('quita acentos, símbolos y espacios', () => {
    expect(slugifyCompanyName('Orquídea Beauty Spa & Co.')).toBe(
      'orquidea-beauty-spa-co',
    );
  });

  it('usa "negocio" si el nombre no deja nada', () => {
    expect(slugifyCompanyName('  ¡¡!!  ')).toBe('negocio');
    expect(slugifyCompanyName(null)).toBe('negocio');
  });

  it('respeta el largo máximo sin dejar un guion al final', () => {
    const slug = slugifyCompanyName(`${'a'.repeat(139)} b`);
    expect(slug.length).toBeLessThanOrEqual(140);
    expect(slug.endsWith('-')).toBe(false);
  });
});

describe('generateUniqueCompanySlug', () => {
  const managerWith = (taken: string[]) =>
    ({
      findOne: jest.fn(
        (_entity: unknown, { where }: { where: { slug: string } }) =>
          Promise.resolve(taken.includes(where.slug) ? { id: 1 } : null),
      ),
    }) as unknown as EntityManager;

  it('devuelve el slug limpio si está libre', async () => {
    await expect(
      generateUniqueCompanySlug(managerWith([]), 'Barbería Don Juan'),
    ).resolves.toBe('barberia-don-juan');
  });

  it('agrega sufijo si ya existe', async () => {
    await expect(
      generateUniqueCompanySlug(
        managerWith(['barberia-don-juan', 'barberia-don-juan-2']),
        'Barbería Don Juan',
      ),
    ).resolves.toBe('barberia-don-juan-3');
  });
});
