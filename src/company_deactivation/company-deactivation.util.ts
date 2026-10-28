import { ForbiddenException, UnauthorizedException } from '@nestjs/common';

/**
 * Marca que acompaña a todo rechazo por salón desactivado. La app y el panel
 * la leen en `reason` para distinguirlo del bloqueo por falta de pago
 * (`subscription_blocked`), que es otra cosa y se arregla pagando.
 */
export const COMPANY_DEACTIVATED_REASON = 'company_deactivated';

export const COMPANY_DEACTIVATED_MESSAGE =
  'Esta cuenta está desactivada. Si crees que es un error, contacta a soporte de Clyps.';

/**
 * El rechazo es un 401 y no un 403 a propósito: ante un 401 la app móvil
 * intenta volver a entrar con las credenciales guardadas, el login también lo
 * rechaza y la app termina sola en la pantalla de inicio de sesión con este
 * mensaje. Con un 403 se quedaría dentro, con todas las pantallas fallando.
 */
export function companyDeactivatedError(): UnauthorizedException {
  return new UnauthorizedException({
    message: COMPANY_DEACTIVATED_MESSAGE,
    reason: COMPANY_DEACTIVATED_REASON,
  });
}

/**
 * Lo mismo para las pantallas SIN sesión (olvidé mi contraseña, reenviar el
 * código). Ahí un 401 haría que la app intentara volver a entrar sin motivo;
 * un 403 solo enseña el mensaje.
 */
export function companyDeactivatedForbidden(): ForbiddenException {
  return new ForbiddenException({
    message: COMPANY_DEACTIVATED_MESSAGE,
    reason: COMPANY_DEACTIVATED_REASON,
  });
}

/**
 * Citas que se cancelan al desactivar el salón: las que todavía no empezaron
 * (1 = Agendada, 8 = Pendiente de asignación), sean de hoy, futuras o vencidas.
 *
 * Las que están EN PROCESO (2) no se tocan: ya se está atendiendo al cliente y
 * puede haber cobros parciales de por medio. Las cerradas (3 Completada,
 * 4 Pagada, 5 Cancelada, 6 Calificada) tampoco: son historia.
 */
export const CANCELLABLE_SESSION_STATUSES = [1, 8] as const;

/** Lo que queda escrito en la cita cancelada, para que se sepa por qué. */
export const DEACTIVATION_CANCEL_REASON = 'Salón desactivado por Clyps';

/**
 * ¿Hay que silenciar a esta persona? Sí solo si TODOS los salones a los que
 * pertenece (como dueño o como trabajador activo) están desactivados.
 *
 * - Sin ningún salón (cliente, o una cuenta a medio registrar) → no: la
 *   desactivación es de salones, no de personas sueltas.
 * - Trabajador en dos salones con uno desactivado → no: el otro salón lo sigue
 *   necesitando y tiene que seguir recibiendo sus avisos.
 */
export function isSilencedByMemberships(
  companyIds: readonly number[],
  deactivated: ReadonlySet<number>,
): boolean {
  if (companyIds.length === 0) return false;
  return companyIds.every((id) => deactivated.has(Number(id)));
}

/**
 * De varias filas de pertenencia, la primera de un salón activo; si todas son
 * de salones desactivados, la primera (y el chequeo de sesión la rechazará).
 * La usa el login para que el trabajador de dos salones entre al que sigue
 * funcionando y no al que se desactivó.
 */
export function preferActiveCompany<T extends { companyId: number }>(
  rows: readonly T[],
  deactivated: ReadonlySet<number>,
): T | null {
  return (
    rows.find((row) => !deactivated.has(Number(row.companyId))) ??
    rows[0] ??
    null
  );
}
