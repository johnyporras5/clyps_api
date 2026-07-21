/**
 * Primitivas de dinero de la nómina (PAY-1).
 *
 * INVARIANTE: el dinero de nómina se almacena SIEMPRE como enteros en la unidad
 * mínima (céntimos de Bs). Nunca como float. Las tasas de comisión se manejan
 * como puntos básicos (basis points): 1500 bps = 15%.
 *
 * El dinero de las citas se guarda hoy como DECIMAL en la moneda del servicio y
 * ya convertido a Bs (session_payment_lines.subtotal_bs, etc.). `toMinor` es el
 * puente: DECIMAL Bs (número) → céntimos enteros.
 */

/** DECIMAL Bs (p. ej. 15.50) → céntimos enteros (1550). */
export function toMinor(bs: number | string | null | undefined): number {
  const n = typeof bs === 'string' ? parseFloat(bs) : (bs ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

/** Céntimos enteros (1550) → Bs (15.5). Para mostrar/serializar. */
export function fromMinor(minor: number): number {
  return (minor || 0) / 100;
}

/**
 * Porcentaje en basis points aplicado a un monto en céntimos.
 * pct(100000, 1500) = 15% de 1000.00 Bs = 15000 céntimos (150.00 Bs).
 */
export function pct(amountMinor: number, rateBps: number): number {
  return Math.round(((amountMinor || 0) * (rateBps || 0)) / 10000);
}

/**
 * Transformer de TypeORM para columnas `bigint` de dinero.
 *
 * mysql2 puede devolver BIGINT como number (dentro de rango seguro) o como
 * string; este `from` normaliza ambos a number de JS. Los céntimos caben de
 * sobra en Number.MAX_SAFE_INTEGER.
 */
export const moneyTransformer = {
  to: (v: number | null | undefined): number => v ?? 0,
  from: (v: string | number | null): number => {
    if (v == null) return 0;
    return typeof v === 'string' ? parseInt(v, 10) : Number(v);
  },
};
