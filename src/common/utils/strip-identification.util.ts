/**
 * Copia `value` sin ningún campo `identification`, a cualquier profundidad.
 * Es lo que ven los salones excluidos del cambio de identidad
 * (legacy-identity.util.ts): las respuestas y eventos llevan clientes y
 * trabajadores anidados en citas, reportes, listas… y en ninguno debe salir.
 *
 * No muta el original: puede ser una entidad que el servicio sigue usando o
 * que otro salón recibe en el mismo evento. Las clases (entidades de TypeORM)
 * salen como objetos planos, que es lo mismo que haría JSON.stringify con
 * ellas. Respeta `toJSON` (Date y cualquier otro que lo tenga) y deja intactos
 * los binarios.
 */
export function stripIdentification(
  value: unknown,
  seen: WeakMap<object, unknown> = new WeakMap(),
): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return value;
  if (Buffer.isBuffer(value) || ArrayBuffer.isView(value)) return value;
  if (seen.has(value)) return seen.get(value);

  const withToJson = value as { toJSON?: () => unknown };
  if (typeof withToJson.toJSON === 'function') {
    return stripIdentification(withToJson.toJSON(), seen);
  }

  if (Array.isArray(value)) {
    const copy: unknown[] = [];
    seen.set(value, copy);
    for (const item of value) copy.push(stripIdentification(item, seen));
    return copy;
  }

  const copy: Record<string, unknown> = {};
  seen.set(value, copy);
  for (const [key, item] of Object.entries(value)) {
    if (key === 'identification') continue;
    copy[key] = stripIdentification(item, seen);
  }
  return copy;
}
