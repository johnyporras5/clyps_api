import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Verificación de la firma del webhook de Cobrix (SUB-10).
 *
 * Es la ÚNICA razón por la que se puede creer lo que dice el payload. Sin esto
 * cualquiera activaría suscripciones con un POST inventado: el endpoint es
 * público por definición —lo llama Cobrix, no un usuario logueado— así que la
 * firma sustituye por completo al token.
 *
 * Protocolo de los eventos generales de Cobrix:
 *
 *   X-Cobrix-Signature: t=<unix>,v1=<hex>
 *   firma = HMAC_SHA256(secreto, `${t}.${cuerpo_crudo}`)
 *
 * El cuerpo tiene que ser el CRUDO, byte a byte. Volver a serializar el JSON
 * cambia espacios y orden y la firma deja de cuadrar.
 *
 * Pura a propósito: se prueba sin levantar Nest ni tocar la red.
 */

/** Por qué se descartó un webhook. Va al log, no al cuerpo de la respuesta. */
export type SignatureFailure =
  | 'no_secret'
  | 'missing_header'
  | 'malformed_header'
  | 'stale_timestamp'
  | 'mismatch';

export type SignatureCheck =
  | { ok: true; timestamp: number }
  | { ok: false; reason: SignatureFailure };

export interface SignatureHeaders {
  /** `X-Cobrix-Signature`. */
  signature?: string;
  /** `X-Cobrix-Timestamp`, respaldo si el header de firma no trae `t=`. */
  timestamp?: string;
}

export interface SignatureOptions {
  secret?: string;
  /** Ventana máxima entre el `t` firmado y ahora, en segundos. */
  toleranceSeconds: number;
  /** Inyectable para poder probar la ventana sin esperar. */
  now?: Date;
}

interface ParsedHeader {
  timestamp: number | null;
  signature: string;
}

/**
 * Desarma `t=1736870400,v1=ab12…`. Tolera el header con solo la firma (ahí el
 * `t` viene en `X-Cobrix-Timestamp`) y un prefijo `sha256=`, que es como lo
 * mandan otras pasarelas y no cuesta nada aceptar.
 */
export function parseSignatureHeader(
  header: string | undefined,
): ParsedHeader | null {
  const raw = header?.trim();
  if (!raw) return null;

  if (!raw.includes('=')) return { timestamp: null, signature: raw };

  const parts = new Map<string, string>();
  for (const chunk of raw.split(',')) {
    const index = chunk.indexOf('=');
    if (index <= 0) continue;
    parts.set(
      chunk.slice(0, index).trim().toLowerCase(),
      chunk.slice(index + 1).trim(),
    );
  }

  const signature = parts.get('v1') ?? parts.get('sha256') ?? '';
  if (!signature) return null;

  const rawTimestamp = parts.get('t');
  const timestamp = rawTimestamp === undefined ? null : Number(rawTimestamp);
  return {
    timestamp:
      timestamp !== null && Number.isFinite(timestamp) ? timestamp : null,
    signature,
  };
}

/**
 * ¿Este cuerpo lo firmó Cobrix, y hace poco?
 *
 * La comparación es en tiempo constante: comparar hex con `===` filtra el
 * secreto byte a byte ante un atacante que mida los tiempos de respuesta.
 */
export function verifyCobrixSignature(
  rawBody: Buffer | string,
  headers: SignatureHeaders,
  options: SignatureOptions,
): SignatureCheck {
  if (!options.secret) return { ok: false, reason: 'no_secret' };

  const parsed = parseSignatureHeader(headers.signature);
  if (!headers.signature?.trim())
    return { ok: false, reason: 'missing_header' };
  if (!parsed) return { ok: false, reason: 'malformed_header' };

  const headerTimestamp = Number(headers.timestamp);
  const timestamp =
    parsed.timestamp ??
    (Number.isFinite(headerTimestamp) && headers.timestamp
      ? headerTimestamp
      : null);
  if (timestamp === null) return { ok: false, reason: 'malformed_header' };

  const nowSeconds = Math.floor((options.now ?? new Date()).getTime() / 1000);
  if (Math.abs(nowSeconds - timestamp) > options.toleranceSeconds)
    return { ok: false, reason: 'stale_timestamp' };

  const body = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody;
  const expected = createHmac('sha256', options.secret)
    .update(`${timestamp}.${body}`)
    .digest();

  let received: Buffer;
  try {
    received = Buffer.from(parsed.signature.replace(/^sha256=/i, ''), 'hex');
  } catch {
    return { ok: false, reason: 'malformed_header' };
  }
  if (received.length !== expected.length)
    return { ok: false, reason: 'mismatch' };

  return timingSafeEqual(received, expected)
    ? { ok: true, timestamp }
    : { ok: false, reason: 'mismatch' };
}

/** La firma que Cobrix mandaría para este cuerpo. Solo para las pruebas. */
export function signCobrixPayload(
  rawBody: string,
  secret: string,
  timestamp: number,
): string {
  const digest = createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');
  return `t=${timestamp},v1=${digest}`;
}

// -----------------------------------------------------------------------------
// Canal de documentos (`cobrix_invoice_v1`)
// -----------------------------------------------------------------------------

/**
 * Verifica la firma del canal de DOCUMENTOS, que es el que confirma el cobro.
 *
 * Es OTRA fórmula y OTRO secreto que la del canal general de arriba: aquí se
 * firma el cuerpo crudo A SECAS, sin timestamp, y la cabecera trae solo el hex.
 * No son intercambiables — usar la fórmula equivocada rechaza todos los eventos
 * en silencio.
 *
 * Sin timestamp no hay ventana que verificar, así que este canal NO protege por
 * sí solo contra reenviar un evento capturado. Lo que lo hace inofensivo es la
 * idempotencia: un evento repetido no vuelve a extender nada.
 */
export function verifyCobrixInvoiceSignature(
  rawBody: Buffer | string,
  signature: string | undefined,
  secret?: string,
): SignatureCheck {
  if (!secret) return { ok: false, reason: 'no_secret' };

  const hex = signature?.trim().replace(/^sha256=/i, '');
  if (!hex) return { ok: false, reason: 'missing_header' };

  const body = Buffer.isBuffer(rawBody)
    ? rawBody
    : Buffer.from(rawBody, 'utf8');
  const expected = createHmac('sha256', secret).update(body).digest();
  const received = Buffer.from(hex, 'hex');

  // timingSafeEqual exige el mismo largo, así que la comparación de tamaño va
  // primero y fuera del algoritmo constante (el largo no es un secreto).
  if (received.length !== expected.length)
    return { ok: false, reason: 'mismatch' };

  return timingSafeEqual(received, expected)
    ? { ok: true, timestamp: 0 }
    : { ok: false, reason: 'mismatch' };
}

/** La firma que Cobrix mandaría por el canal de documentos. Solo para pruebas. */
export function signCobrixInvoicePayload(
  rawBody: string,
  secret: string,
): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex');
}
