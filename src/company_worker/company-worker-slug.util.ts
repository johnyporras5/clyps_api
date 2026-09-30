import { EntityManager, Not } from 'typeorm';
import { slugifyText } from '../company/company-slug.util';
import { CompanyWorker } from './entities/company_worker.entity';

export function slugifyWorkerName(name: string | null | undefined): string {
  return slugifyText(name, 'profesional');
}

/**
 * Slug del profesional para su enlace de reservas
 * (`/reservar/<negocio>/<profesional>`). Es único DENTRO del negocio: dos
 * negocios pueden tener cada uno su "ana-torres". Si ya existe en el negocio,
 * agrega `-2`, `-3`…
 *
 * Se asigna una sola vez y no cambia con el nombre: es un enlace compartido.
 */
export async function generateUniqueWorkerSlug(
  manager: EntityManager,
  companyId: number,
  name: string | null | undefined,
  excludeCompanyWorkerId?: number,
): Promise<string> {
  const base = slugifyWorkerName(name);
  for (let suffix = 1; suffix < 1000; suffix++) {
    const candidate = suffix === 1 ? base : `${base}-${suffix}`;
    const existing = await manager.findOne(CompanyWorker, {
      where: {
        companyId,
        slug: candidate,
        ...(excludeCompanyWorkerId ? { id: Not(excludeCompanyWorkerId) } : {}),
      },
      select: { id: true },
    });
    if (!existing) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}
