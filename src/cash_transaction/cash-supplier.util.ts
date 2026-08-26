/**
 * Normalización de proveedores de caja (CLYP-355).
 *
 * `supplier_name` es texto libre — no hay tabla de proveedores. Para que
 * "Ferretería López", "ferreteria lopez" y "  Ferreteria   Lopez " sean EL MISMO
 * proveedor en el autocompletado y en los reportes, cada movimiento guarda
 * también `supplier_key`: la versión normalizada del nombre.
 *
 * El nombre original se conserva tal como lo escribió el dueño (es lo que se
 * muestra); la clave es solo para agrupar y buscar.
 */

/** Diacríticos combinables que deja NFD (tildes, diéresis, etc.). */
const COMBINING_MARKS = /[̀-ͯ]/g;

/** Nombre listo para mostrar: sin espacios sobrantes, con sus acentos intactos. */
export function cleanSupplierName(
  raw: string | null | undefined,
): string | null {
  if (raw == null) return null;
  const collapsed = raw.trim().replace(/\s+/g, ' ');
  return collapsed === '' ? null : collapsed;
}

/**
 * Nombre libre → clave de agrupación: sin espacios de más, sin acentos y en
 * minúsculas.
 *
 * La ñ SÍ se respeta: en español no es una n acentuada sino otra letra, y
 * fundir "Peña" con "Pena" sería agrupar dos proveedores distintos. Por eso el
 * texto se parte por la ñ y solo se quitan los acentos de los pedazos.
 *
 * Devuelve null si no queda nada (vacío o solo espacios), que es lo mismo que
 * "sin proveedor".
 */
export function normalizeSupplierName(
  raw: string | null | undefined,
): string | null {
  const collapsed = cleanSupplierName(raw);
  if (collapsed === null) return null;

  return collapsed
    .toLowerCase()
    .split('ñ')
    .map((part) => part.normalize('NFD').replace(COMBINING_MARKS, ''))
    .join('ñ');
}
