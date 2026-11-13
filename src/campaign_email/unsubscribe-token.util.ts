import { createHmac, timingSafeEqual } from 'crypto';

/**
 * El enlace "No quiero recibir promociones" del pie de los correos.
 *
 * Va FIRMADO: sin la firma, cualquiera podría armar la URL con el correo de otro
 * y darlo de baja. La firma es un HMAC del correo con un secreto del servidor;
 * no caduca (un correo viejo tiene que seguir sirviendo para darse de baja).
 */

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function b64url(buf: Buffer): string {
  return buf.toString('base64url');
}

export function signUnsubscribe(email: string, secret: string): string {
  return b64url(
    createHmac('sha256', `unsubscribe:${secret}`)
      .update(normalizeEmail(email))
      .digest(),
  );
}

/** Compara en tiempo constante: no se puede adivinar la firma por tiempos. */
export function verifyUnsubscribe(
  email: string,
  token: string,
  secret: string,
): boolean {
  const expected = Buffer.from(signUnsubscribe(email, secret));
  const given = Buffer.from(token ?? '');
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** `e` = correo en base64url (no viaja en claro en la URL), `t` = firma. */
export function unsubscribeUrl(
  apiBase: string,
  email: string,
  secret: string,
): string {
  const e = b64url(Buffer.from(normalizeEmail(email), 'utf8'));
  const t = signUnsubscribe(email, secret);
  return `${apiBase.replace(/\/+$/, '')}/public/email/unsubscribe?e=${e}&t=${t}`;
}

/** El correo dentro de `e`, o null si no es un correo plausible. */
export function decodeEmailParam(e: string | undefined): string | null {
  if (!e || e.length > 400) return null;
  try {
    const email = Buffer.from(e, 'base64url').toString('utf8');
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 245
      ? normalizeEmail(email)
      : null;
  } catch {
    return null;
  }
}
