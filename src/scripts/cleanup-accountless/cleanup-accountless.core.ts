/**
 * Limpieza de cuentas sin correo que quedaron de antes del cambio de identidad
 * (subtarea 6).
 *
 * Antes, un trabajador o cliente dado de alta SIN correo recibía igual una fila
 * en `user`: sin correo, con una contraseña que nadie conoce y que nunca se usó.
 * Desde el cambio, esas altas no tienen `user` (user_id = NULL). Esto deja las
 * viejas igual que las nuevas: suelta la ficha de su `user` y borra el `user`.
 * La ficha (nombre, teléfono, citas, historial) no se toca.
 *
 * NO se toca a nadie que:
 *  - esté en algún salón excluido del cambio (LEGACY_IDENTITY_COMPANY_IDS):
 *    allí las cuentas sin correo siguen existiendo a propósito;
 *  - haya iniciado sesión alguna vez;
 *  - tenga algo enlazado a su `user` (notificaciones, reseñas, pagos…).
 *
 * Aquí está la lógica, sin base de datos, para poder probarla. El ejecutable
 * es ../cleanup-accountless-users.ts.
 */

/** Lo mínimo que hace falta para correr SQL: un QueryRunner o un EntityManager. */
export interface SqlRunner {
  query(sql: string, params?: unknown[]): Promise<unknown>;
}

export interface Candidate {
  kind: 'client' | 'worker';
  profileId: number;
  userId: number;
  username: string | null;
  /** Salones de la ficha: `client.companies` o los `company_worker` del trabajador. */
  companyIds: number[];
}

export type SkipReason = 'legacy_company' | 'has_references';

export interface Plan {
  clean: Candidate[];
  skipped: { candidate: Candidate; reason: SkipReason; detail?: string }[];
}

/**
 * Columnas que guardan el id de un `user`. Si una cuenta aparece en cualquiera,
 * tiene algo propio y no se borra: se lista para revisarla a mano.
 * Las reseñas guardan el `user.id` del cliente en `client_id`.
 * Los códigos de verificación no están: esos se borran junto con la cuenta.
 */
export const USER_REFERENCES: { table: string; column: string }[] = [
  { table: 'notifications', column: 'user_id' },
  { table: 'fcm_tokens', column: 'user_id' },
  { table: 'blacklisted_tokens', column: 'userId' },
  { table: 'impersonation_session', column: 'actor_user_id' },
  { table: 'impersonation_session', column: 'target_user_id' },
  { table: 'company_feedback', column: 'client_id' },
  { table: 'service_feedback', column: 'client_id' },
  { table: 'worker_feedback', column: 'client_id' },
  { table: 'client_note', column: 'created_by_user_id' },
  { table: 'cash_transaction', column: 'created_by_user_id' },
  { table: 'direct_sale', column: 'created_by_user_id' },
  { table: 'session_payments', column: 'paid_by' },
  { table: 'session_payment_reversal', column: 'reverted_by_user_id' },
  { table: 'payout', column: 'recorded_by_user_id' },
  { table: 'payroll_concept', column: 'created_by_user_id' },
  { table: 'payroll_period', column: 'approved_by_user_id' },
  { table: 'product_stock_movement', column: 'created_by_user_id' },
  { table: 'payment_report', column: 'verified_by_user_id' },
  { table: 'company', column: 'user_id' },
];

export interface Options {
  apply: boolean;
  /** Confirmación explícita de que se quiere correr SIN salones excluidos. */
  noLegacy: boolean;
}

export function parseArgs(argv: string[]): Options {
  return {
    apply: argv.includes('--apply'),
    noLegacy: argv.includes('--no-legacy'),
  };
}

/**
 * Con la variable vacía, aplicar limpiaría también los salones que deben
 * quedar como estaban. Solo se permite si se pide a propósito.
 */
export function assertCanApply(options: Options, legacyIds: number[]): void {
  if (!options.apply) return;
  if (legacyIds.length === 0 && !options.noLegacy) {
    throw new Error(
      'LEGACY_IDENTITY_COMPANY_IDS está vacía: aplicar limpiaría también los salones excluidos. ' +
        'Ponla en el .env de este ambiente, o pasa --no-legacy si de verdad no hay ninguno.',
    );
  }
}

/** Decide, sin tocar nada, quién se limpia y quién se salta y por qué. */
export function classify(
  candidates: Candidate[],
  legacyIds: number[],
  referencedUserIds: Map<number, string[]>,
): Plan {
  const plan: Plan = { clean: [], skipped: [] };
  for (const candidate of candidates) {
    const legacy = candidate.companyIds.filter((id) => legacyIds.includes(id));
    if (legacy.length > 0) {
      plan.skipped.push({
        candidate,
        reason: 'legacy_company',
        detail: `salón excluido ${legacy.join(', ')}`,
      });
      continue;
    }
    const refs = referencedUserIds.get(candidate.userId);
    if (refs && refs.length > 0) {
      plan.skipped.push({
        candidate,
        reason: 'has_references',
        detail: refs.join(', '),
      });
      continue;
    }
    plan.clean.push(candidate);
  }
  return plan;
}

/** Normaliza el JSON de salones que llega de MySQL (texto, array o null). */
export function parseCompanyIds(raw: unknown): number[] {
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  return value
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0);
}

/** Lo que devuelve MySQL en un UPDATE/DELETE: cuántas filas tocó. */
function affectedRows(result: unknown): number {
  const r = result as { affectedRows?: number } | [unknown, number];
  if (Array.isArray(r)) return Number(r[1] ?? 0);
  return Number(r?.affectedRows ?? 0);
}

/**
 * Limpia UNA ficha. Se llama dentro de una transacción.
 *
 * El ORDEN importa: `worker.user_id` y `client.user_id` tienen
 * ON DELETE CASCADE, así que borrar el `user` primero borraría también la
 * ficha. Primero se suelta la ficha y recién después se borra la cuenta.
 *
 * Cada paso re-chequea lo que asume (que la ficha sigue apuntando a ese user,
 * que nunca inició sesión): si algo cambió desde que se armó el plan, no se
 * toca y devuelve false.
 */
export async function cleanCandidate(
  runner: SqlRunner,
  candidate: Candidate,
): Promise<boolean> {
  const table = candidate.kind === 'client' ? 'client' : 'worker';
  const released = await runner.query(
    `UPDATE \`${table}\` SET \`user_id\` = NULL WHERE \`id\` = ? AND \`user_id\` = ?`,
    [candidate.profileId, candidate.userId],
  );
  if (affectedRows(released) !== 1) return false;

  if (candidate.kind === 'worker') {
    await runner.query(
      'UPDATE `company_worker` SET `user_id` = NULL WHERE `user_id` = ?',
      [candidate.userId],
    );
  }

  await runner.query(
    'DELETE FROM `user_verification_codes` WHERE `user_id` = ?',
    [candidate.userId],
  );

  const deleted = await runner.query(
    'DELETE FROM `user` WHERE `id` = ? AND `last_login` IS NULL',
    [candidate.userId],
  );
  if (affectedRows(deleted) !== 1) {
    // Inició sesión justo ahora: que la transacción deshaga lo anterior.
    throw new Error(
      `El usuario ${candidate.userId} cambió durante la limpieza; no se tocó.`,
    );
  }
  return true;
}

/** CSV con lo que se limpió, para revisar o rehacer las cuentas si hiciera falta. */
export function toCsv(rows: Candidate[]): string {
  const escape = (v: string | number | null) =>
    `"${String(v ?? '').replace(/"/g, '""')}"`;
  const header = 'kind,profile_id,user_id,username,company_ids';
  const lines = rows.map((r) =>
    [r.kind, r.profileId, r.userId, r.username, r.companyIds.join(' ')]
      .map(escape)
      .join(','),
  );
  return [header, ...lines].join('\n') + '\n';
}

/** Cuántos hay por salón: para ver, antes de aplicar, que no aparezca ninguno excluido. */
export function countByCompany(
  rows: Candidate[],
): Map<number | 'sin salón', number> {
  const counts = new Map<number | 'sin salón', number>();
  for (const row of rows) {
    const keys =
      row.companyIds.length > 0 ? row.companyIds : ['sin salón' as const];
    for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}
