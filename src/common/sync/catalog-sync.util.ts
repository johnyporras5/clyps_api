import { BadRequestException, HttpStatus } from '@nestjs/common';
import type { EntityManager } from 'typeorm';

/**
 * BE-OFF-4: `?since=` en los catálogos que la app guarda en el teléfono.
 *
 * La app manda la `serverTime` de su última sincronización y recibe solo lo
 * que cambió después (`updated_at > since`), más lo que se borró.
 *
 * Todo se compara con el RELOJ DE LA BASE en UTC: `updated_at` lo escribe
 * MySQL, así que `serverTime` también sale de MySQL. Mezclar el reloj de Node
 * con el de la base abriría huecos si se desfasan.
 */

/** Cuánto se guardan los borrados. Un `since` más viejo pide descarga completa. */
export const CATALOG_DELETION_RETENTION_DAYS = 90;

/**
 * `serverTime` se devuelve con este margen hacia atrás: un cambio que se
 * estaba guardando justo al sincronizar (transacción abierta) podría quedar
 * con un `updated_at` anterior a la `serverTime` y perderse. Restando un
 * minuto, la siguiente sincronización lo vuelve a traer. La app puede recibir
 * alguna fila repetida: la reemplaza por id.
 */
export const SERVER_TIME_MARGIN_SECONDS = 60;

export type CatalogEntity = 'service' | 'company_worker';

const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/;

export interface SyncWindow {
  /** Desde cuándo filtrar; null = devolver todo (como siempre). */
  since: Date | null;
  /** El `since` era más viejo que los borrados guardados: se devuelve todo. */
  fullSync: boolean;
}

/**
 * Lee `?since=`. Sin valor → sin filtro. Formato inválido → 400. Más viejo que
 * los borrados guardados → sin filtro y `fullSync: true`, para que la app
 * reemplace su copia entera (si no, se perdería borrados ya purgados).
 */
export function resolveSince(raw: unknown, now: Date = new Date()): SyncWindow {
  if (raw === undefined || raw === null || raw === '') {
    return { since: null, fullSync: false };
  }
  if (typeof raw !== 'string' || !ISO_UTC_RE.test(raw)) {
    throw new BadRequestException({
      statusCode: HttpStatus.BAD_REQUEST,
      code: 'SINCE_INVALID',
      message:
        'since debe ser una fecha ISO en UTC con Z: usa el serverTime de la última sincronización.',
    });
  }
  const since = new Date(raw);
  if (isNaN(since.getTime())) {
    throw new BadRequestException({
      statusCode: HttpStatus.BAD_REQUEST,
      code: 'SINCE_INVALID',
      message: 'since no es una fecha válida.',
    });
  }
  const oldest =
    now.getTime() - CATALOG_DELETION_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  if (since.getTime() < oldest) {
    return { since: null, fullSync: true };
  }
  return { since, fullSync: false };
}

/**
 * La fecha como texto UTC para comparar en SQL ('2026-11-20 19:56:39.123').
 * Se manda como TEXTO a propósito: si se manda un Date, el driver lo convierte
 * a la hora local del proceso (Caracas) y la comparación con `updated_at`
 * (UTC) quedaría corrida 4 horas.
 */
export function toUtcSql(date: Date): string {
  return date.toISOString().replace('T', ' ').replace('Z', '');
}

/** La hora de la base en UTC, menos el margen, en ISO con Z. */
export async function getServerTime(manager: EntityManager): Promise<string> {
  const rows: Array<{ t: string }> = await manager.query(
    `SELECT DATE_FORMAT(UTC_TIMESTAMP(3) - INTERVAL ? SECOND, '%Y-%m-%d %H:%i:%s.%f') AS t`,
    [SERVER_TIME_MARGIN_SECONDS],
  );
  // '2026-11-20 19:55:39.123000' → '2026-11-20T19:55:39.123Z'
  return new Date(`${rows[0].t.slice(0, 23).replace(' ', 'T')}Z`).toISOString();
}

/** Anota un borrado definitivo (la fila desaparece) para avisarlo con `since`. */
export async function recordCatalogDeletion(
  manager: EntityManager,
  companyId: number,
  entity: CatalogEntity,
  entityId: number,
): Promise<void> {
  await manager.query(
    'INSERT INTO catalog_deletion (company_id, entity, entity_id) VALUES (?, ?, ?)',
    [companyId, entity, entityId],
  );
}

/** Ids borrados de verdad después de `since` en esos salones. */
export async function deletedIdsSince(
  manager: EntityManager,
  companyIds: number[],
  entity: CatalogEntity,
  since: Date,
): Promise<number[]> {
  if (companyIds.length === 0) return [];
  const rows: Array<{ entityId: number | string }> = await manager.query(
    `SELECT DISTINCT entity_id AS entityId
       FROM catalog_deletion
      WHERE company_id IN (?) AND entity = ? AND deleted_at > ?
      ORDER BY entity_id`,
    [companyIds, entity, toUtcSql(since)],
  );
  return rows.map((r) => Number(r.entityId));
}

/** Borra los avisos de borrado más viejos que la retención. */
export async function purgeCatalogDeletions(
  manager: EntityManager,
): Promise<number> {
  const result: { affectedRows?: number } = await manager.query(
    'DELETE FROM catalog_deletion WHERE deleted_at < UTC_TIMESTAMP(6) - INTERVAL ? DAY',
    [CATALOG_DELETION_RETENTION_DAYS],
  );
  return result?.affectedRows ?? 0;
}

/** Lo que se agrega a la respuesta paginada de cada catálogo. */
export interface SyncResponseFields {
  /** Mandar como `since` en la próxima sincronización. */
  serverTime: string;
  /** El `since` era muy viejo: reemplazar la copia local entera. */
  fullSync?: true;
  /** Solo con `since`: ids que se borraron de verdad (quitarlos). */
  deletedIds?: number[];
}

export function syncFields(
  serverTime: string,
  window: SyncWindow,
  deletedIds?: number[],
): SyncResponseFields {
  return {
    serverTime,
    ...(window.fullSync ? { fullSync: true as const } : {}),
    ...(window.since && deletedIds ? { deletedIds } : {}),
  };
}
