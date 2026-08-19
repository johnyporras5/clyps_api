import type {
  TemplateCategory,
  TemplateService,
} from '../types/rubro-template.types';

/** Rubro que efectivamente se usó para armar la respuesta. */
export interface ResolvedRubro {
  key: string;
  name: string;
}

/** Respuesta de GET /onboarding/templates. */
export interface OnboardingTemplatesResponse {
  /** Rubros combinados, en su orden de catálogo. */
  rubros: ResolvedRubro[];
  /** Rubros pedidos que no existen o están inactivos (se ignoran). */
  unknownRubros: string[];
  /** Categorías combinadas sin duplicar, en orden de presentación. */
  categories: TemplateCategory[];
  totals: { categories: number; services: number };
  /** Tope de servicios aplicado por rubro antes de combinar. */
  limitPerRubro: number;
  /** Servicios recortados por el tope (0 = no se recortó nada). */
  truncatedServices: number;
}

export type { TemplateCategory, TemplateService };
