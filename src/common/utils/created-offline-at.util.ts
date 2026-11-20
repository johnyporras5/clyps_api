import { BadRequestException, HttpStatus } from '@nestjs/common';

/**
 * BE-OFF-3: `createdOfflineAt` es cuándo se creó DE VERDAD una cita o un
 * cliente en la app sin red. Lo manda el teléfono al sincronizar.
 *
 * Es un dato que escribe el cliente y el servidor no puede comprobar, así que
 * se acota: no puede estar en el futuro (con 5 min de margen por relojes
 * desfasados) ni tener más de 7 días. Sin el tope de antigüedad, cualquiera
 * podría decir "la agendé hace un mes" y meter citas pasadas.
 */

/** Margen para relojes de teléfono adelantados. */
export const OFFLINE_FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

/** Lo más viejo que se acepta: ninguna cola sin red legítima dura más. */
export const OFFLINE_MAX_AGE_DAYS = 7;

/** ISO 8601 en UTC con Z, con o sin milisegundos: 2026-11-20T13:00:00.000Z */
const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

const fail = (code: string, message: string): BadRequestException =>
  new BadRequestException({
    statusCode: HttpStatus.BAD_REQUEST,
    code,
    message,
  });

/**
 * Convierte y valida `createdOfflineAt`. Devuelve null si no vino (la petición
 * sigue con las reglas de siempre).
 */
export function parseCreatedOfflineAt(
  raw: unknown,
  now: Date = new Date(),
): Date | null {
  if (raw === undefined || raw === null || raw === '') return null;

  const value = raw instanceof Date ? raw.toISOString() : raw;
  if (typeof value !== 'string' || !ISO_UTC_RE.test(value)) {
    throw fail(
      'CREATED_OFFLINE_AT_INVALID',
      'createdOfflineAt debe ser una fecha ISO en UTC con Z (ej. 2026-11-20T13:00:00.000Z).',
    );
  }

  const date = new Date(value);
  if (isNaN(date.getTime())) {
    throw fail(
      'CREATED_OFFLINE_AT_INVALID',
      'createdOfflineAt no es una fecha válida.',
    );
  }

  if (date.getTime() > now.getTime() + OFFLINE_FUTURE_TOLERANCE_MS) {
    throw fail(
      'CREATED_OFFLINE_AT_IN_FUTURE',
      'createdOfflineAt no puede estar en el futuro. Revisa la hora del teléfono.',
    );
  }

  const oldest = now.getTime() - OFFLINE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  if (date.getTime() < oldest) {
    throw fail(
      'CREATED_OFFLINE_AT_TOO_OLD',
      `createdOfflineAt no puede tener más de ${OFFLINE_MAX_AGE_DAYS} días.`,
    );
  }

  return date;
}
