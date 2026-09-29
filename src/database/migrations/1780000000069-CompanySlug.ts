import { MigrationInterface, QueryRunner } from 'typeorm';
import { slugifyCompanyName } from '../../company/company-slug.util';

/**
 * Enlace público de reservas: `company.slug` (/reservar/<slug>).
 *
 * Las compañías nuevas lo reciben al insertarse (CompanySubscriber). Aquí se
 * rellena el de las existentes a partir del nombre; los repetidos llevan
 * sufijo `-2`, `-3`… en orden de id, así el negocio más antiguo se queda con
 * el slug limpio.
 */
export class CompanySlug1780000000069 implements MigrationInterface {
  name = 'CompanySlug1780000000069';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`company\` ADD \`slug\` varchar(160) NULL AFTER \`logo\``,
    );

    const companies = (await queryRunner.query(
      `SELECT \`id\`, \`name\` FROM \`company\` ORDER BY \`id\` ASC`,
    )) as { id: number; name: string | null }[];

    const used = new Set<string>();
    for (const company of companies) {
      const base = slugifyCompanyName(company.name);
      let candidate = base;
      for (let suffix = 2; used.has(candidate); suffix++) {
        candidate = `${base}-${suffix}`;
      }
      used.add(candidate);
      await queryRunner.query(
        `UPDATE \`company\` SET \`slug\` = ? WHERE \`id\` = ?`,
        [candidate, company.id],
      );
    }

    await queryRunner.query(
      `CREATE UNIQUE INDEX \`UQ_company_slug\` ON \`company\` (\`slug\`)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX \`UQ_company_slug\` ON \`company\``);
    await queryRunner.query(`ALTER TABLE \`company\` DROP COLUMN \`slug\``);
  }
}
