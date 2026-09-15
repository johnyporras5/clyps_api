/**
 * Normalización de la cédula/RIF con la que se factura (CLYP-343).
 *
 * Cobrix identifica al cliente por su identidad fiscal, no por nuestro
 * `company_id`. Eso significa que la MISMA persona escrita de dos formas
 * —`1234567` hoy, `V1234567` mañana— le crea dos clientes distintos, con sus
 * facturas repartidas entre los dos. Y al revés: dos salones que comparten
 * dueño salen como uno solo, que es inevitable y no hace daño.
 *
 * Lo que sí podemos evitar es el duplicado por tipeo. Aquí se lleva todo a una
 * sola forma: `V-12345678`.
 *
 * La letra es OBLIGATORIA y no se adivina. Un `12345678` suelto puede ser la
 * cédula `V-12345678` o el RIF `J-12345678`, y elegir por él manda a Cobrix una
 * identidad que no es la suya: la factura sale a nombre de otro, o la rechaza.
 * Preguntarle una vez cuesta menos que arreglar eso después.
 */

/** Las letras que usa el SENIAT. */
const PREFIJOS = 'VEJPG';

/** Lo que sobra al escribir: espacios, puntos, guiones, guiones bajos. */
const RUIDO = /[\s._-]/g;

const FORMA = new RegExp(`^([${PREFIJOS}])(\\d{6,10})$`);

/**
 * Devuelve la identificación en forma canónica, o `null` si no es una.
 *
 * Es generosa al leer y estricta al escribir: acepta `v 12.345.678`,
 * `V-12345678` y `J401234567`, y siempre devuelve `V-12345678` / `J-401234567`.
 */
export function normalizeIdentification(
  raw: string | null | undefined,
): string | null {
  if (typeof raw !== 'string') return null;

  const limpio = raw.toUpperCase().replace(RUIDO, '');
  const match = FORMA.exec(limpio);
  if (!match) return null;

  return `${match[1]}-${match[2]}`;
}

/** El mensaje que se le muestra al dueño. Uno solo, escrito en un solo sitio. */
export const IDENTIFICATION_FORMAT_MESSAGE =
  'Escribe tu cédula o RIF con su letra: V-12345678 o J-401234567.';
