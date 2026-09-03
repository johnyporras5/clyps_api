/** Respuesta de POST /onboarding/services/scratch. */
export interface DefaultCategoryResponse {
  /** Categoría que el dueño puede usar ya para crear su primer servicio. */
  categoryId: number;
  name: string;
  /** `false` = la company ya tenía categorías y no se tocó nada. */
  created: boolean;
}
