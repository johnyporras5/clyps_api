/**
 * Limpieza de cuentas sin correo de antes del cambio de identidad (subtarea 6).
 * Qué hace y qué NO toca: ver cleanup-accountless/cleanup-accountless.core.ts.
 *
 * Se corre A MANO en cada ambiente, con el .env de ese ambiente:
 *
 *   npm run cleanup:accountless                 # solo muestra lo que haría
 *   npm run cleanup:accountless -- --apply      # lo hace
 *
 * No es una migración a propósito: el pipeline corre las migraciones sin
 * LEGACY_IDENTITY_COMPANY_IDS, y sin esa lista limpiaría también los salones
 * que deben quedar como estaban.
 *
 * Requiere la migración 1780000000072 (user_id opcional) ya corrida.
 */
import { writeFileSync } from 'fs';
import { DataSource } from 'typeorm';
import baseDataSource from '../typeorm-config/typeorm.config';
import { legacyIdentityCompanyIds } from '../common/utils/legacy-identity.util';
import {
  Candidate,
  USER_REFERENCES,
  assertCanApply,
  classify,
  cleanCandidate,
  countByCompany,
  parseArgs,
  parseCompanyIds,
  toCsv,
} from './cleanup-accountless/cleanup-accountless.core';

const NO_EMAIL = `(u.email IS NULL OR TRIM(u.email) = '' OR LOWER(TRIM(u.email)) = 'no disponible')`;

async function loadCandidates(db: DataSource): Promise<Candidate[]> {
  const clients = await db.query<Record<string, unknown>[]>(`
    SELECT 'client' AS kind, cl.id AS profileId, u.id AS userId, u.username,
           cl.companies AS companies
      FROM \`user\` u
      JOIN \`client\` cl ON cl.user_id = u.id
     WHERE u.user_type = 'cli' AND u.last_login IS NULL AND ${NO_EMAIL}`);

  const workers = await db.query<Record<string, unknown>[]>(`
    SELECT 'worker' AS kind, w.id AS profileId, u.id AS userId, u.username,
           (SELECT JSON_ARRAYAGG(cw.company_id) FROM \`company_worker\` cw
             WHERE cw.worker_id = w.id) AS companies
      FROM \`user\` u
      JOIN \`worker\` w ON w.user_id = u.id
     WHERE u.user_type = 'wrk' AND u.last_login IS NULL AND ${NO_EMAIL}`);

  return [...clients, ...workers].map((row) => ({
    kind: row.kind as Candidate['kind'],
    profileId: Number(row.profileId),
    userId: Number(row.userId),
    username: (row.username as string | null) ?? null,
    companyIds: parseCompanyIds(row.companies),
  }));
}

/** Por cada cuenta candidata, en qué tablas aparece. Salta las que no existen. */
async function loadReferences(
  db: DataSource,
  userIds: number[],
): Promise<Map<number, string[]>> {
  const refs = new Map<number, string[]>();
  if (userIds.length === 0) return refs;

  const existing = new Set(
    (
      await db.query<{ col: string }[]>(
        `SELECT CONCAT(TABLE_NAME, '.', COLUMN_NAME) AS col
           FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()`,
      )
    ).map((r) => r.col),
  );

  for (const { table, column } of USER_REFERENCES) {
    if (!existing.has(`${table}.${column}`)) continue;
    const rows = await db.query<{ userId: number }[]>(
      `SELECT DISTINCT \`${column}\` AS userId FROM \`${table}\` WHERE \`${column}\` IN (?)`,
      [userIds],
    );
    for (const { userId } of rows) {
      const list = refs.get(Number(userId)) ?? [];
      list.push(`${table}.${column}`);
      refs.set(Number(userId), list);
    }
  }
  return refs;
}

async function assertMigrationRan(db: DataSource): Promise<void> {
  const rows = await db.query<{ t: string; n: string }[]>(
    `SELECT TABLE_NAME AS t, IS_NULLABLE AS n FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME = 'user_id'
        AND TABLE_NAME IN ('worker', 'client')`,
  );
  if (rows.length !== 2 || rows.some((r) => r.n !== 'YES')) {
    throw new Error(
      'worker.user_id / client.user_id todavía no aceptan NULL: corre antes las migraciones (1780000000072).',
    );
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const legacyIds = legacyIdentityCompanyIds();
  assertCanApply(options, legacyIds);

  const db = new DataSource({ ...baseDataSource.options, logging: false });
  await db.initialize();
  try {
    await assertMigrationRan(db);

    const candidates = await loadCandidates(db);
    const refs = await loadReferences(
      db,
      candidates.map((c) => c.userId),
    );
    const plan = classify(candidates, legacyIds, refs);

    console.log(`Base: ${String(db.options.database)}`);
    console.log(
      `Salones excluidos (LEGACY_IDENTITY_COMPANY_IDS): ${legacyIds.join(', ') || '(ninguno)'}`,
    );
    console.log(`Cuentas sin correo que nunca entraron: ${candidates.length}`);
    console.log(`  Se limpiarían: ${plan.clean.length}`);
    for (const [company, n] of countByCompany(plan.clean)) {
      console.log(`    salón ${company}: ${n}`);
    }
    const legacySkipped = plan.skipped.filter(
      (s) => s.reason === 'legacy_company',
    );
    const refSkipped = plan.skipped.filter(
      (s) => s.reason === 'has_references',
    );
    console.log(`  Se saltan por salón excluido: ${legacySkipped.length}`);
    console.log(
      `  Se saltan por tener algo enlazado (revisar a mano): ${refSkipped.length}`,
    );
    for (const s of refSkipped) {
      console.log(
        `    ${s.candidate.kind} ${s.candidate.profileId} (user ${s.candidate.userId}): ${s.detail}`,
      );
    }

    if (!options.apply) {
      console.log(
        '\nNo se cambió nada. Para aplicar: npm run cleanup:accountless -- --apply',
      );
      return;
    }

    const done: Candidate[] = [];
    const failed: { candidate: Candidate; error: string }[] = [];
    for (const candidate of plan.clean) {
      try {
        const ok = await db.transaction((em) => cleanCandidate(em, candidate));
        if (ok) done.push(candidate);
        else
          failed.push({
            candidate,
            error: 'la ficha ya no apuntaba a ese user',
          });
      } catch (error) {
        failed.push({ candidate, error: (error as Error).message });
      }
    }

    const file = `cleanup-accountless-${String(db.options.database)}-${Date.now()}.csv`;
    writeFileSync(file, toCsv(done));
    console.log(`\nLimpiadas: ${done.length}. Detalle en ${file}`);
    if (failed.length > 0) {
      console.log(`No se pudieron limpiar: ${failed.length}`);
      for (const f of failed) {
        console.log(
          `  ${f.candidate.kind} ${f.candidate.profileId} (user ${f.candidate.userId}): ${f.error}`,
        );
      }
    }
  } finally {
    await db.destroy();
  }
}

main().catch((error: unknown) => {
  console.error((error as Error).message);
  process.exit(1);
});
