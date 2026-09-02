/**
 * Fuentes de la tasa USD→VES (SUB-2 / CLYP-334).
 *
 * ===========================================================================
 * FUENTES DOCUMENTADAS — si una deja de funcionar, se repara AQUÍ
 * ===========================================================================
 * Las tres publican las MISMAS tasas oficiales del BCV, y las tres sirven tanto
 * el dólar como el euro. Verificado el 2026-08-31: dólar 794,9917 y euro
 * 922,69121677 Bs, idénticos en las tres.
 *
 * 1) `dolarapi` (primaria) — API pública de DolarAPI Venezuela.
 *    Dólar: GET https://ve.dolarapi.com/v1/dolares/oficial
 *    Euro : GET https://ve.dolarapi.com/v1/euros/oficial
 *    campo → `promedio` (si viniera null, se promedia `compra` y `venta`).
 *
 * 2) `erapi` (respaldo) — ExchangeRate-API, plan abierto y sin llave.
 *    Dólar: GET https://open.er-api.com/v6/latest/USD
 *    Euro : GET https://open.er-api.com/v6/latest/EUR
 *    campo → `rates.VES`.
 *
 * 3) `bcv` (último recurso) — scraping del HTML del sitio oficial del BCV.
 *    GET https://www.bcv.org.ve/ (la misma página trae las dos tasas)
 *    campo → el `<strong>` dentro de `<div id="dolar">` o de `<div id="euro">`
 *    según la tasa pedida, hoy renderizado como
 *    `<strong class="strong-tb">794,99170000</strong>` (coma decimal). Por eso
 *    el regex acepta atributos en la etiqueta: si le agregan una clase nueva,
 *    sigue funcionando.
 *    OJO: el BCV sirve la cadena de certificados INCOMPLETA y Node rechaza la
 *    conexión (`UNABLE_TO_VERIFY_LEAF_SIGNATURE`) aunque curl y el navegador la
 *    acepten; por eso lleva `insecureTls` — ver `rate/http-client.ts`. Sumado a
 *    que el sitio se cae seguido, va de último aun siendo el oficial.
 *
 * NOTA — pyDolarVenezuela (`pydolarve.org`) se descartó: al 2026-08-31 toda su
 * API responde 404 (v1 y v2). Si revive, se agrega aquí como una fuente más.
 *
 * El orden y el tipo de cambio se configuran por entorno
 * (`SUBSCRIPTION_RATE_SOURCES`, `SUBSCRIPTION_RATE_TYPE`): cambiar de fuente o
 * pasar del dólar al euro NO debe requerir tocar código.
 */

/**
 * Qué tasa oficial del BCV se usa para cobrar. La elige el desarrollador por
 * entorno: `oficial` es el dólar y `euro` es el euro.
 */
export type RateType = 'oficial' | 'euro';
export const RATE_TYPES: RateType[] = ['oficial', 'euro'];

export type RateSourceId = 'dolarapi' | 'erapi' | 'bcv';

export interface RateSource {
  id: RateSourceId;
  /** Nombre legible, va en la respuesta de la cotización y en los logs. */
  label: string;
  /** URL a consultar. null = esta fuente no publica esa tasa. */
  url: (type: RateType) => string | null;
  /** Extrae la tasa del cuerpo crudo. null si no la encuentra. */
  parse: (body: string, type: RateType) => number | null;
  /** El sitio sirve un certificado que Node no valida (solo el BCV). */
  insecureTls?: boolean;
}

/** Defaults de la cotización. Todos sobreescribibles por entorno. */
export const RATE_DEFAULTS = {
  /** Tasa a usar: el dólar oficial del BCV. */
  type: 'oficial' as RateType,
  /** Orden en que se intentan las fuentes: la primera que responda gana. */
  sources: ['dolarapi', 'erapi', 'bcv'] as RateSourceId[],
  /** Timeout por intento. Corto: esto corre dentro de un request del dueño. */
  timeoutMs: 4000,
  /** Intentos por fuente antes de pasar a la siguiente. */
  attempts: 2,
  /** Espera entre intentos de la misma fuente. */
  retryDelayMs: 150,
  /** Banda de cordura: fuera de esto la tasa se descarta como absurda. */
  minRate: 1,
  maxRate: 100000,
  /** Cuánto vale una cotización antes de tener que recotizar. */
  quoteTtlHours: 3,
  /** Cuánto puede haberse movido la tasa congelada contra la de hoy (5%). */
  rateToleranceBps: 500,
};

/**
 * "1.234,56" | "1234.56" | 1234.56 → 1234.56
 *
 * El BCV publica con coma decimal y punto de millar; las APIs devuelven number.
 * Se normalizan los tres casos aquí y no en cada parser.
 */
export function parseRateNumber(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== 'string') return null;

  const cleaned = raw.trim().replace(/[^\d.,-]/g, '');
  if (!cleaned) return null;

  const hasComma = cleaned.includes(',');
  const hasDot = cleaned.includes('.');
  // Con ambos, la coma es el decimal y el punto el millar ("1.234,56").
  const normalized =
    hasComma && hasDot
      ? cleaned.replace(/\./g, '').replace(',', '.')
      : hasComma
        ? cleaned.replace(',', '.')
        : cleaned;

  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

/** Navega un objeto ya parseado sin castear a `any`. */
function pick(value: unknown, path: string[]): unknown {
  let current: unknown = value;
  for (const key of path) {
    if (typeof current !== 'object' || current === null) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function parseJson(body: string): unknown {
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return null;
  }
}

export const RATE_SOURCES: Record<RateSourceId, RateSource> = {
  dolarapi: {
    id: 'dolarapi',
    label: 'DolarAPI Venezuela',
    url: (type) =>
      type === 'euro'
        ? 'https://ve.dolarapi.com/v1/euros/oficial'
        : 'https://ve.dolarapi.com/v1/dolares/oficial',
    parse: (body) => {
      const json = parseJson(body);
      const promedio = parseRateNumber(pick(json, ['promedio']));
      if (promedio !== null) return promedio;

      // `compra` y `venta` suelen venir en null en la oficial; si algún día
      // dejan de publicar `promedio`, esto evita quedarse sin tasa.
      const compra = parseRateNumber(pick(json, ['compra']));
      const venta = parseRateNumber(pick(json, ['venta']));
      if (compra !== null && venta !== null) return (compra + venta) / 2;
      return compra ?? venta;
    },
  },

  erapi: {
    id: 'erapi',
    label: 'ExchangeRate-API',
    // La moneda base de la consulta es la que decide qué tasa vuelve.
    url: (type) =>
      `https://open.er-api.com/v6/latest/${type === 'euro' ? 'EUR' : 'USD'}`,
    parse: (body) => parseRateNumber(pick(parseJson(body), ['rates', 'VES'])),
  },

  bcv: {
    id: 'bcv',
    label: 'BCV (sitio oficial)',
    // La portada trae las dos tasas: cambia el bloque, no la URL.
    url: () => 'https://www.bcv.org.ve/',
    parse: (body, type) => {
      const block = type === 'euro' ? 'euro' : 'dolar';
      // `<strong ...>` con atributos: el sitio hoy le pone class="strong-tb".
      const match = new RegExp(
        `id="${block}"[\\s\\S]{0,800}?<strong[^>]*>\\s*([\\d.,]+)\\s*</strong>`,
        'i',
      ).exec(body);
      return match ? parseRateNumber(match[1]) : null;
    },
    insecureTls: true,
  },
};

export function isRateType(value: unknown): value is RateType {
  return typeof value === 'string' && (RATE_TYPES as string[]).includes(value);
}

export function isRateSourceId(value: unknown): value is RateSourceId {
  return typeof value === 'string' && value in RATE_SOURCES;
}
