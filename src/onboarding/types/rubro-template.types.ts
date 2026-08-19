/**
 * ONB-2: catálogo maestro de plantillas por rubro (propiedad de la plataforma).
 *
 * Las plantillas traen SOLO la estructura (qué categorías / qué servicios). No
 * llevan precio, comisión ni trabajadores: esos son datos del negocio y los pone
 * el dueño al confirmar (ONB-3).
 */

/** Servicio sugerido dentro de una categoría de la plantilla. */
export interface TemplateService {
  /** Normalizado, para deduplicar entre rubros. Ej: 'corte_cabello'. */
  key: string;
  name: string;
  /** Genérica y editable por el dueño. SIN precio ni comisión. */
  description: string;
}

/** Categoría sugerida de un rubro. */
export interface TemplateCategory {
  /** Normalizado, para deduplicar entre rubros. Ej: 'cortes'. */
  key: string;
  name: string;
  description: string;
  services: TemplateService[];
}

/** Contenido de la columna `template` (json) de un rubro. */
export interface RubroTemplate {
  categories: TemplateCategory[];
}
