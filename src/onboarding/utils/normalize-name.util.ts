/**
 * Normaliza un nombre para compararlo: sin acentos, sin signos, en minúsculas y
 * con los espacios colapsados. "Corte de Cabello" y "corte  de cabello" caen en
 * el mismo valor.
 *
 * Lo usan ONB-2 (deduplicar servicios al combinar rubros) y ONB-3 (no duplicar
 * una categoría/servicio que el dueño ya tiene con otro nombre escrito distinto).
 */
export function normalizeName(value: string): string {
  return (value || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
