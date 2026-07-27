/**
 * Catálogo de opciones para la consulta general de sugerencias con IA.
 */
export interface SuggestionOption {
  id: string;
  name: string;
}

export const SUGGESTION_CATEGORIES: SuggestionOption[] = [
  // Cabello
  { id: 'cabello', name: 'Cabello' },
  { id: 'cortes', name: 'Cortes' },
  { id: 'coloracion', name: 'Coloración' },
  { id: 'peinados', name: 'Peinados' },
  { id: 'tratamientos-capilares', name: 'Tratamientos capilares' },
  { id: 'barberia', name: 'Barba y barbería' },
  // Uñas
  { id: 'unas', name: 'Uñas' },
  { id: 'pedicura', name: 'Pedicura' },
  // Rostro
  { id: 'maquillaje', name: 'Maquillaje' },
  { id: 'cejas-pestanas', name: 'Cejas y pestañas' },
  { id: 'tratamientos-faciales', name: 'Tratamientos faciales' },
  { id: 'micropigmentacion', name: 'Micropigmentación' },
  // Cuerpo
  { id: 'depilacion', name: 'Depilación' },
  { id: 'spa-masajes', name: 'Spa y masajes' },
  { id: 'estetica-corporal', name: 'Estética corporal' },
  { id: 'bronceado', name: 'Bronceado' },
  // Arte corporal
  { id: 'tatuajes', name: 'Tatuajes' },
  { id: 'piercings', name: 'Piercings' },
];

export const SUGGESTION_STYLES: SuggestionOption[] = [
  { id: 'moderno', name: 'Moderno' },
  { id: 'clasico', name: 'Clásico' },
];

export const SUGGESTION_OPTIONS = {
  categories: SUGGESTION_CATEGORIES,
  styles: SUGGESTION_STYLES,
};

/** Etiqueta de una categoría por su slug, o undefined si el slug no existe. */
export const findCategoryLabel = (slug: string): string | undefined =>
  SUGGESTION_CATEGORIES.find((c) => c.id === slug)?.name;

/** Etiqueta de un estilo por su slug, o undefined si el slug no existe. */
export const findStyleLabel = (slug: string): string | undefined =>
  SUGGESTION_STYLES.find((s) => s.id === slug)?.name;
