/**
 * Zona por ahora FIJA
 */

/** Zona horaria del negocio (IANA). Configurable por env; default Venezuela. */
export const BUSINESS_TIMEZONE =
  process.env.BUSINESS_TIMEZONE || 'America/Caracas';

/** Extrae [year, month, day] de un 'YYYY-MM-DD' (tolera sufijo de hora). */
function parseYmd(dateStr: string): [number, number, number] {
  const [y, m, d] = dateStr.split('T')[0].split(' ')[0].split('-').map(Number);
  return [y, m, d];
}

/**
 * Offset (en ms) de `timeZone` respecto a UTC en el instante `at`. Positivo si
 * la zona va por delante de UTC, negativo si va por detrás (GMT-4 → -14400000).
 * Usa Intl, así que es correcto para cualquier zona IANA (incluido DST).
 */
function tzOffsetMs(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);

  const map: Record<string, number> = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = Number(p.value);
  }

  const asUtc = Date.UTC(
    map.year,
    map.month - 1,
    map.day,
    map.hour,
    map.minute,
    map.second,
  );
  return asUtc - at.getTime();
}

/**
 * Instante UTC de la medianoche (00:00:00.000) de `dateStr` (YYYY-MM-DD) en la
 * zona del negocio. Ej.: businessDayStart('2026-07-14') con GMT-4 → 2026-07-14T04:00:00Z.
 */
export function businessDayStart(
  dateStr: string,
  timeZone: string = BUSINESS_TIMEZONE,
): Date {
  const [y, m, d] = parseYmd(dateStr);
  // Instante que representaría esa medianoche SI la zona fuese UTC.
  const guess = Date.UTC(y, m - 1, d, 0, 0, 0, 0);
  // La zona real está desplazada `offset`; el instante verdadero es guess - offset.
  const offset = tzOffsetMs(timeZone, new Date(guess));
  return new Date(guess - offset);
}

/** 'YYYY-MM-DD' del día siguiente a `dateStr`. */
function nextDayStr(dateStr: string): string {
  const [y, m, d] = parseYmd(dateStr);
  const next = new Date(Date.UTC(y, m - 1, d));
  next.setUTCDate(next.getUTCDate() + 1);
  const mm = String(next.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(next.getUTCDate()).padStart(2, '0');
  return `${next.getUTCFullYear()}-${mm}-${dd}`;
}

/**
 * Límites [inicio, fin] de un día del negocio, como instantes UTC, para usar en
 * `Between(startOfDay, endOfDay)` (fin INCLUSIVO: medianoche del día siguiente
 * menos 1 ms). Maneja el cambio de mes/año y días con DST.
 */
export function businessDayBounds(
  dateStr: string,
  timeZone: string = BUSINESS_TIMEZONE,
): { startOfDay: Date; endOfDay: Date } {
  const startOfDay = businessDayStart(dateStr, timeZone);
  const nextStart = businessDayStart(nextDayStr(dateStr), timeZone);
  return { startOfDay, endOfDay: new Date(nextStart.getTime() - 1) };
}

/**
 * Límites de un RANGO de días del negocio (inclusivo en ambos extremos): desde
 * la medianoche del primer día hasta el fin del último día.
 */
export function businessRangeBounds(
  startDateStr: string,
  endDateStr: string,
  timeZone: string = BUSINESS_TIMEZONE,
): { startOfDay: Date; endOfDay: Date } {
  return {
    startOfDay: businessDayBounds(startDateStr, timeZone).startOfDay,
    endOfDay: businessDayBounds(endDateStr, timeZone).endOfDay,
  };
}

/** Fecha ('YYYY-MM-DD') en la zona del negocio para un instante dado. */
export function businessDateOf(
  instant: Date | string,
  timeZone: string = BUSINESS_TIMEZONE,
): string {
  // en-CA formatea como YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(instant));
}

/** Fecha de HOY ('YYYY-MM-DD') en la zona del negocio. */
export function businessToday(timeZone: string = BUSINESS_TIMEZONE): string {
  return businessDateOf(new Date(), timeZone);
}

/**
 * Límites del día del negocio que CONTIENE al instante dado. Útil para acotar
 * candidatos "del mismo día" (p. ej. el pre-filtro del chequeo de solape).
 */
export function businessDayBoundsForInstant(
  instant: Date | string,
  timeZone: string = BUSINESS_TIMEZONE,
): { startOfDay: Date; endOfDay: Date } {
  return businessDayBounds(businessDateOf(instant, timeZone), timeZone);
}

/** Días (inclusive) entre dos 'YYYY-MM-DD'. Mismo día = 1. */
export function inclusiveDayCount(
  startDateStr: string,
  endDateStr: string,
): number {
  const [sy, sm, sd] = parseYmd(startDateStr);
  const [ey, em, ed] = parseYmd(endDateStr);
  return (
    Math.round(
      (Date.UTC(ey, em - 1, ed) - Date.UTC(sy, sm - 1, sd)) / 86400000,
    ) + 1
  );
}
