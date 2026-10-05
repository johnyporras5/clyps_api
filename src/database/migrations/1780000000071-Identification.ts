import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cédula o RIF de los tres roles: `company.identification` (el RIF del negocio,
 * que es la del dueño), `worker.identification` y `client.identification`.
 *
 * Se guardan en forma canónica (`V-12345678`, ver identification.util.ts).
 * No llevan índice único: la regla es "no repetida dentro del mismo salón", y
 * el salón de un trabajador vive en `company_worker` y el de un cliente en el
 * JSON `client.companies`, así que la valida el servicio. El índice simple es
 * para que esa búsqueda no recorra la tabla entera.
 */
export class Identification1780000000071 implements MigrationInterface {
  name = 'Identification1780000000071';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['company', 'worker', 'client']) {
      await queryRunner.query(
        `ALTER TABLE \`${table}\` ADD \`identification\` varchar(20) NULL`,
      );
      await queryRunner.query(
        `CREATE INDEX \`IDX_${table}_identification\` ON \`${table}\` (\`identification\`)`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['company', 'worker', 'client']) {
      await queryRunner.query(
        `DROP INDEX \`IDX_${table}_identification\` ON \`${table}\``,
      );
      await queryRunner.query(
        `ALTER TABLE \`${table}\` DROP COLUMN \`identification\``,
      );
    }
  }
}
