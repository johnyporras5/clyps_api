import { randomInt } from 'crypto';

/**
 * Alfabeto base32 estilo Crockford: dígitos + letras SIN caracteres ambiguos
 * (se excluyen I, L, O, U para no confundir al leer/dictar). 32 símbolos.
 */
export const SESSION_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Largo por defecto del código (6 → 32^6 ≈ 1.070 millones de combinaciones). */
export const SESSION_CODE_LENGTH = 6;

/**
 * Genera el código visual de una cita: N símbolos base32 aleatorios, sin
 * prefijo (ej. `7HE8CN`). Es SOLO para mostrar; los enlaces/lookups siguen
 * usando el `id` interno. La unicidad la garantiza el SessionSubscriber
 * reintentando contra la BD, así que aquí solo importa que sea aleatorio.
 */
export function generateSessionCode(
  length: number = SESSION_CODE_LENGTH,
): string {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += SESSION_CODE_ALPHABET[randomInt(0, SESSION_CODE_ALPHABET.length)];
  }
  return code;
}
