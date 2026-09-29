import { EntityManager, Not } from 'typeorm';
import { Company } from './entities/company.entity';

/** Largo máximo del slug (la columna es varchar(160); se deja margen al sufijo). */
const SLUG_MAX_LENGTH = 140;

/**
 * Convierte el nombre del negocio en un segmento de URL: minúsculas, sin
 * acentos, solo letras/números separados por guiones.
 * Ej.: "Orquídea Beauty Spa & Co." → "orquidea-beauty-spa-co".
 */
export function slugifyCompanyName(name: string | null | undefined): string {
  const base = (name ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/g, '');
  return base || 'negocio';
}

/**
 * Slug único para el enlace público de reservas (`/reservar/<slug>`). Si el
 * base ya lo usa otra compañía, agrega `-2`, `-3`…
 *
 * El slug se asigna una sola vez (al crear la compañía) y NO cambia si luego
 * cambia el nombre: es un enlace que el negocio ya compartió.
 */
export async function generateUniqueCompanySlug(
  manager: EntityManager,
  name: string | null | undefined,
  excludeCompanyId?: number,
): Promise<string> {
  const base = slugifyCompanyName(name);
  for (let suffix = 1; suffix < 1000; suffix++) {
    const candidate = suffix === 1 ? base : `${base}-${suffix}`;
    const existing = await manager.findOne(Company, {
      where: {
        slug: candidate,
        ...(excludeCompanyId ? { id: Not(excludeCompanyId) } : {}),
      },
      select: { id: true },
    });
    if (!existing) return candidate;
  }
  // Prácticamente inalcanzable: 999 negocios con el mismo nombre.
  return `${base}-${Date.now().toString(36)}`;
}
