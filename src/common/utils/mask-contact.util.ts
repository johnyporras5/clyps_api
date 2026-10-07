/**
 * Datos de contacto tapados para mostrarle a un salón un cliente que todavía
 * no es suyo (búsqueda por cédula): alcanzan para reconocer a la persona, pero
 * no para sacarle el correo o el teléfono probando cédulas.
 */

/** `ana.perez@gmail.com` → `an***@gmail.com`. `null` si no hay correo. */
export function maskEmail(email: string | null | undefined): string | null {
  const value = email?.trim();
  if (!value) return null;
  const at = value.lastIndexOf('@');
  if (at <= 0) return null;
  const local = value.slice(0, at);
  const visible = local.length <= 2 ? local.slice(0, 1) : local.slice(0, 2);
  return `${visible}***${value.slice(at)}`;
}

/** `+584141234567` → `••• 4567` (los últimos 4). `null` si no hay teléfono. */
export function maskPhone(phone: string | null | undefined): string | null {
  const digits = phone?.replace(/\D/g, '') ?? '';
  if (digits.length < 4) return null;
  return `••• ${digits.slice(-4)}`;
}
