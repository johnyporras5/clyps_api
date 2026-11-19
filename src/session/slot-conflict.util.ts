import { ConflictException, HttpStatus } from '@nestjs/common';
import type { EntityManager } from 'typeorm';

/**
 * BE-OFF-2: choque de horario al crear una cita.
 *
 * Sin red, la app calcula la disponibilidad con su copia local, y dos
 * teléfonos pueden agendar a la misma trabajadora a la misma hora. Al
 * sincronizar decide el servidor: la primera cita que llega gana y la segunda
 * recibe 409 SLOT_TAKEN con el detalle.
 */

export const SLOT_TAKEN = 'SLOT_TAKEN';

/**
 * Estados de un servicio que NO ocupan la agenda: 3 completado, 4 pagado,
 * 5 cancelado. Son los mismos que ignora GET /sessions/availability, para que
 * lo que la app ve como libre sea lo que el servidor acepta.
 */
export const NON_BLOCKING_DETAIL_STATUSES = [3, 4, 5] as const;

/** Un servicio de la cita que se quiere crear, con trabajadora asignada. */
export interface PlannedDetail {
  /** Posición del detalle en el arreglo `details` que mandó la app. */
  detailIndex: number;
  companyWorkerId: number;
  start: Date;
  end: Date;
}

export interface SlotConflict {
  detailIndex: number;
  companyWorkerId: number;
  /** Rango pedido del detalle que choca, en UTC con Z. */
  startDatetime: string;
  endDatetime: string;
  conflictingSessionId: number;
}

/**
 * Bloquea (hasta el fin de la transacción) a las trabajadoras de la cita.
 *
 * Funciona como un turno por trabajadora: si llega otra cita para ella al
 * mismo tiempo, espera a que esta termine de guardarse y después ve la agenda
 * ya actualizada. Se bloquea la fila de `company_worker` y no las citas del
 * rango porque cuando el hueco está libre no hay citas que bloquear: dos
 * peticiones pasarían las dos (o terminarían en deadlock).
 *
 * Ordenar por id evita que dos citas con varias trabajadoras se bloqueen entre
 * sí esperando cada una a la otra.
 */
export async function lockWorkers(
  manager: EntityManager,
  companyWorkerIds: number[],
): Promise<void> {
  const ids = [...new Set(companyWorkerIds)].sort((a, b) => a - b);
  if (ids.length === 0) return;
  await manager.query(
    'SELECT id FROM company_worker WHERE id IN (?) ORDER BY id FOR UPDATE',
    [ids],
  );
}

/**
 * Busca, para cada detalle, una cita ya guardada de la misma trabajadora que
 * se solape con [inicio, fin). Tocarse en el borde (una termina 14:00, otra
 * empieza 14:00) NO es choque.
 *
 * El fin de la cita existente es su `end_datetime`; si no lo tiene (citas
 * viejas), inicio + duración. No se filtra por día: una cita que cruza la
 * medianoche también cuenta.
 */
export async function findSlotConflicts(
  manager: EntityManager,
  planned: PlannedDetail[],
): Promise<SlotConflict[]> {
  const conflicts: SlotConflict[] = [];

  for (const detail of planned) {
    // Rango vacío (sin duración): no ocupa nada.
    if (!(detail.end.getTime() > detail.start.getTime())) continue;

    const rows: Array<{ sessionId: number | string }> = await manager.query(
      `SELECT sd.session_id AS sessionId
         FROM session_detail sd
        WHERE sd.company_worker_id = ?
          AND sd.start_datetime IS NOT NULL
          AND sd.status NOT IN (?)
          AND sd.start_datetime < ?
          AND COALESCE(
                sd.end_datetime,
                DATE_ADD(sd.start_datetime, INTERVAL COALESCE(sd.total_time, 0) MINUTE)
              ) > ?
        ORDER BY sd.start_datetime ASC
        LIMIT 1`,
      [
        detail.companyWorkerId,
        [...NON_BLOCKING_DETAIL_STATUSES],
        detail.end,
        detail.start,
      ],
    );

    if (rows.length > 0) {
      conflicts.push({
        detailIndex: detail.detailIndex,
        companyWorkerId: detail.companyWorkerId,
        startDatetime: detail.start.toISOString(),
        endDatetime: detail.end.toISOString(),
        conflictingSessionId: Number(rows[0].sessionId),
      });
    }
  }

  return conflicts;
}

export function slotTakenException(
  conflicts: SlotConflict[],
): ConflictException {
  return new ConflictException({
    statusCode: HttpStatus.CONFLICT,
    code: SLOT_TAKEN,
    message: 'El trabajador ya tiene una cita en ese horario',
    conflicts,
  });
}
