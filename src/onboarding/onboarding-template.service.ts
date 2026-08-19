import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { OnboardingRubroTemplate } from './entities/onboarding_rubro_template.entity';
import { CompanyCategory } from '../company_category/entities/company_category.entity';
import type {
  TemplateCategory,
  TemplateService,
} from './types/rubro-template.types';
import { normalizeName } from './utils/normalize-name.util';
import type {
  OnboardingTemplatesResponse,
  ResolvedRubro,
} from './dto/onboarding-templates-response.dto';

/**
 * Tope de servicios por rubro, para no abrumar al dueño en la pantalla de
 * confirmación. El seed está curado dentro de este límite (el rubro más cargado,
 * barbería, trae 9), así que hoy no recorta nada; existe como red de seguridad
 * si una plantilla crece. El frontend puede pedir uno menor con `?limit=`.
 */
export const DEFAULT_SERVICES_PER_RUBRO = 10;

/**
 * ONB-2: lectura del catálogo maestro de plantillas.
 *
 * Combina los rubros que pida el dueño (o los que ya tiene marcados) en una sola
 * lista de categorías y servicios, sin duplicados. Solo lee: no crea nada del
 * tenant — eso es ONB-3.
 */
@Injectable()
export class OnboardingTemplateService {
  constructor(
    @InjectRepository(OnboardingRubroTemplate)
    private readonly templateRepository: Repository<OnboardingRubroTemplate>,
    @InjectRepository(CompanyCategory)
    private readonly companyCategoryRepository: Repository<CompanyCategory>,
  ) {}

  /** Rubros que la company ya marcó al registrarse (`company_category.name`). */
  private async getCompanyRubros(companyId: number): Promise<string[]> {
    const rows = await this.companyCategoryRepository.find({
      where: { companyId },
    });
    return [
      ...new Set(
        rows
          .map((r) => (r.name || '').trim().toLowerCase())
          .filter((s) => s.length > 0),
      ),
    ];
  }

  /**
   * Recorta la plantilla de UN rubro al tope de servicios, respetando el orden
   * de las categorías. Devuelve también cuántos servicios se dejaron fuera.
   */
  private applyLimit(
    categories: TemplateCategory[],
    limit: number,
  ): { categories: TemplateCategory[]; truncated: number } {
    const out: TemplateCategory[] = [];
    let used = 0;
    let truncated = 0;

    for (const category of categories) {
      const services = category.services || [];
      const room = Math.max(0, limit - used);
      if (room === 0) {
        truncated += services.length;
        continue;
      }
      const kept = services.slice(0, room);
      truncated += services.length - kept.length;
      used += kept.length;
      // Categoría que se queda sin servicios por el tope: no se muestra vacía.
      if (kept.length > 0) out.push({ ...category, services: kept });
    }

    return { categories: out, truncated };
  }

  /**
   * GET /onboarding/templates
   *
   * @param companyId company del token; se usa si no llegan rubros explícitos.
   * @param requestedRubros slugs pedidos (ej. 'barberia,salon_belleza').
   * @param limit tope de servicios por rubro.
   */
  async getTemplates(
    companyId: number,
    requestedRubros?: string[],
    limit: number = DEFAULT_SERVICES_PER_RUBRO,
  ): Promise<OnboardingTemplatesResponse> {
    const asked =
      requestedRubros && requestedRubros.length > 0
        ? [
            ...new Set(
              requestedRubros
                .map((r) => r.trim().toLowerCase())
                .filter((r) => r.length > 0),
            ),
          ]
        : await this.getCompanyRubros(companyId);

    if (asked.length === 0) {
      return {
        rubros: [],
        unknownRubros: [],
        categories: [],
        totals: { categories: 0, services: 0 },
        limitPerRubro: limit,
        truncatedServices: 0,
      };
    }

    const found = await this.templateRepository.find({
      where: { rubroKey: In(asked), isActive: true },
      order: { sortOrder: 'ASC', id: 'ASC' },
    });

    const foundKeys = new Set(found.map((t) => t.rubroKey));
    // Rubros pedidos sin plantilla (o inactivos): se ignoran, pero se informan
    // para que el frontend sepa qué no se pudo precargar.
    const unknownRubros = asked.filter((r) => !foundKeys.has(r));

    // Combinación: las CATEGORÍAS se agrupan solo por `key`. No se fusionan por
    // nombre a propósito: `color_barberia` ("Color" de caballero) y `color`
    // ("Color" de salón) se llaman igual pero son plantillas distintas, y ONB-3
    // usa la key como llave de idempotencia — fusionarlas perdería una.
    // Los SERVICIOS sí se deduplican también por nombre normalizado, para que el
    // dueño nunca vea dos veces el mismo servicio.
    const categoriesByKey = new Map<string, TemplateCategory>();
    const seenServiceKeys = new Set<string>();
    const seenServiceNames = new Set<string>();
    let truncatedServices = 0;

    for (const rubro of found) {
      const { categories, truncated } = this.applyLimit(
        rubro.template?.categories || [],
        limit,
      );
      truncatedServices += truncated;

      for (const category of categories) {
        let target = categoriesByKey.get(category.key);
        if (!target) {
          target = {
            key: category.key,
            name: category.name,
            description: category.description,
            services: [],
          };
          categoriesByKey.set(category.key, target);
        }

        for (const service of category.services || []) {
          const serviceNameKey = normalizeName(service.name);
          if (
            seenServiceKeys.has(service.key) ||
            seenServiceNames.has(serviceNameKey)
          )
            continue;
          seenServiceKeys.add(service.key);
          seenServiceNames.add(serviceNameKey);
          target.services.push({
            key: service.key,
            name: service.name,
            description: service.description,
          } satisfies TemplateService);
        }
      }
    }

    const merged = [...categoriesByKey.values()].filter(
      (c) => c.services.length > 0,
    );
    const rubros: ResolvedRubro[] = found.map((t) => ({
      key: t.rubroKey,
      name: t.rubroName,
    }));

    return {
      rubros,
      unknownRubros,
      categories: merged,
      totals: {
        categories: merged.length,
        services: merged.reduce((acc, c) => acc + c.services.length, 0),
      },
      limitPerRubro: limit,
      truncatedServices,
    };
  }
}
