import { MigrationInterface, QueryRunner } from 'typeorm';
import { slugifyWorkerName } from '../../company_worker/company-worker-slug.util';

/**
 * Enlace de reservas por profesional: `company_worker.slug`
 * (/reservar/<negocio>/<profesional>).
 *
 * Es único dentro del negocio. Los registros nuevos lo reciben al insertarse
 * (CompanyWorkerSubscriber); aquí se rellenan los existentes a partir del
 * nombre del trabajador. Repetidos en el mismo negocio llevan `-2`, `-3`… en
 * orden de id.
 */
export class CompanyWorkerSlug1780000000070 implements MigrationInterface {
  name = 'CompanyWorkerSlug1780000000070';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`company_worker\` ADD \`slug\` varchar(160) NULL AFTER \`is_active\``,
    );

    const rows = (await queryRunner.query(
      `SELECT cw.\`id\`, cw.\`company_id\` AS companyId, w.\`name\`
         FROM \`company_worker\` cw
         LEFT JOIN \`worker\` w ON w.\`id\` = cw.\`worker_id\`
        ORDER BY cw.\`id\` ASC`,
    )) as { id: number; companyId: number; name: string | null }[];

    const usedByCompany = new Map<number, Set<string>>();
    for (const row of rows) {
      const used = usedByCompany.get(row.companyId) ?? new Set<string>();
      usedByCompany.set(row.companyId, used);

      const base = slugifyWorkerName(row.name);
      let candidate = base;
      for (let suffix = 2; used.has(candidate); suffix++) {
        candidate = `${base}-${suffix}`;
      }
      used.add(candidate);
      await queryRunner.query(
        `UPDATE \`company_worker\` SET \`slug\` = ? WHERE \`id\` = ?`,
        [candidate, row.id],
      );
    }

    await queryRunner.query(
      `CREATE UNIQUE INDEX \`UQ_company_worker_company_slug\` ON \`company_worker\` (\`company_id\`, \`slug\`)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX \`UQ_company_worker_company_slug\` ON \`company_worker\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`company_worker\` DROP COLUMN \`slug\``,
    );
  }
}
