/**
 * Lectura de los eventos que manda Cobrix (SUB-10).
 *
 * Es DEFENSIVA a propósito: el payload lo escribe un tercero, su contrato es
 * aditivo —su documentación pide tolerar campos desconocidos y nulos— y mezcla
 * `snake_case` en la API pública con `camelCase` en la de integraciones. Cada
 * dato se busca por varias rutas: las primeras son las medidas contra eventos
 * reales, las de abajo son respaldo de su documentación.
 *
 * Nada revienta por un campo ausente: un 500 aquí hace que Cobrix reintente
 * cuatro veces un evento que no vamos a poder procesar nunca.
 *
 * Puro: se prueba con los payloads de ejemplo, sin red.
 */

/** El evento que confirma el cobro. Es el único que activa algo. */
export const COBRIX_EVENT_INVOICE_PAID = 'invoice.paid';

/** Un evento del canal de documentos (`cobrix_invoice_v1`), ya normalizado. */
export interface CobrixInvoiceEvent {
  /** `invoice.paid`, `invoice.created`, `invoice.canceled`. */
  eventType: string;
  /**
   * Llave de idempotencia. Este canal NO trae un id de evento propio, así que
   * se compone con lo que sí identifica la operación: tipo + factura + pago.
   */
  eventId: string;
  /** Nuestra referencia (`provider_id`): con esto se localiza la factura. */
  providerReference: string | null;
  /** El id de la factura en Cobrix. */
  invoiceId: string | null;
  /** Id o referencia del pago que saldó la factura. */
  paymentId: string | null;
  amount: number | null;
  currency: string | null;
}

/**
 * Desarma el evento del canal de documentos.
 *
 * La forma real, medida contra un evento de producción:
 *
 *   { event:   { type, timestamp, company_id, environment },
 *     invoice: { id, amount, status, provider, reference, provider_id,
 *                payment: { id, amount, currency, status, paid_at, ... } } }
 *
 * ⚠️ `event` es un OBJETO, no el nombre del evento. Leerlo como string es el
 * error que hace que se descarte todo en silencio: sin nombre el evento se tira
 * y el webhook responde 200 sin activar nada.
 */
export function parseCobrixInvoiceEvent(
  payload: unknown,
): CobrixInvoiceEvent | null {
  const raw = asRecord(payload);

  const eventType = eventNameOf(raw);
  if (!eventType) return null;

  const invoiceId =
    asString(pick(raw, ['invoice', 'id'])) ??
    asString(pick(raw, ['data', 'invoice', 'invoiceId'])) ??
    asString(pick(raw, ['data', 'invoice', 'id']));

  const paymentId =
    asString(pick(raw, ['invoice', 'payment', 'id'])) ??
    asString(pick(raw, ['invoice', 'payment', 'reference'])) ??
    asString(pick(raw, ['data', 'event', 'reference']));

  return {
    eventType,
    // Sin id propio, la llave se compone. Un mismo pago sobre una misma factura
    // es el mismo evento por más veces que Cobrix lo reentregue.
    eventId: `${eventType}:${invoiceId ?? 'sin-factura'}:${paymentId ?? 'sin-pago'}`,
    providerReference:
      asString(pick(raw, ['invoice', 'provider_id'])) ??
      asString(pick(raw, ['invoice', 'payment', 'external_id'])) ??
      asString(pick(raw, ['data', 'event', 'provider_id'])) ??
      asString(pick(raw, ['data', 'invoice', 'externalInvoiceId'])) ??
      asString(raw.provider_id),
    invoiceId,
    paymentId,
    amount:
      asNumber(pick(raw, ['invoice', 'payment', 'amount'])) ??
      asNumber(pick(raw, ['invoice', 'amount'])) ??
      asNumber(pick(raw, ['data', 'event', 'amount'])),
    currency:
      asString(pick(raw, ['invoice', 'payment', 'currency'])) ??
      asString(pick(raw, ['invoice', 'currency'])) ??
      asString(pick(raw, ['data', 'event', 'currency'])),
  };
}

/**
 * Nombre del evento, sirva el canal que sirva.
 *
 * El canal general lo manda como string (`{ id, event, data }`) y el de
 * documentos como objeto (`{ event: { type } }`). Se aceptan los dos.
 */
export function eventNameOf(payload: unknown): string | null {
  const raw = asRecord(payload);
  return (
    asString(pick(raw, ['event', 'type'])) ??
    asString(raw.event) ??
    asString(raw.type) ??
    asString(pick(raw, ['data', 'event', 'type']))
  );
}

/** El id de evento del canal general, que sí lo trae en el envelope. */
export function eventIdOf(payload: unknown): string | null {
  return asString(asRecord(payload).id);
}

/**
 * Busca nuestra referencia (`clyps-7-1788367908`) en CUALQUIER parte del cuerpo.
 *
 * Es para el canal GENERAL, donde la referencia viaja INCRUSTADA dentro de otro
 * identificador (medido: `data.documents[0].invoiceNumber =
 * "clyps:clyps-7-1788372343"`). Buscar el PATRÓN en vez de adivinar una ruta es
 * lo que evita descartar eventos buenos: el patrón `<provider>-<id>-<epoch>` es
 * lo bastante específico como para no confundirse con nada más del cuerpo, y
 * sigue funcionando si mañana cambian la estructura.
 */
export function findProviderReference(
  payload: unknown,
  provider: string,
): string | null {
  const pattern = new RegExp(
    `${provider.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-\\d+-\\d+`,
  );
  let found: string | null = null;

  const walk = (value: unknown, depth: number): void => {
    if (found || depth > 8 || !value) return;
    if (typeof value === 'string') {
      found = pattern.exec(value)?.[0] ?? null;
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) walk(item, depth + 1);
      return;
    }
    if (typeof value === 'object')
      for (const item of Object.values(value)) walk(item, depth + 1);
  };

  walk(payload, 0);
  return found;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function asNumber(value: unknown): number | null {
  const parsed = typeof value === 'string' ? Number(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : null;
}

/** Navega un objeto por una ruta de claves; cualquier tramo ausente da undefined. */
function pick(source: Record<string, unknown>, path: string[]): unknown {
  let current: unknown = source;
  for (const key of path) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}
