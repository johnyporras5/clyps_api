import { MigrationInterface, QueryRunner } from 'typeorm';

// PAY-2: blindaje "un solo periodo open por empresa". MySQL no tiene índices
// parciales, así que se usa una columna generada = company_id cuando status
// es 'open' (si no, NULL) + un único sobre ella. Varios NULL conviven (varios
// periodos no-abiertos); solo puede haber un open_marker por empresa.
export class PayrollOneOpenPeriod1780000000024 implements MigrationInterface {
  name = 'PayrollOneOpenPeriod1780000000024';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`payroll_period\`
      ADD COLUMN \`open_marker\` int
      GENERATED ALWAYS AS (CASE WHEN \`status\` = 'open' THEN \`company_id\` ELSE NULL END) VIRTUAL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX \`UQ_payroll_period_one_open\`
      ON \`payroll_period\` (\`open_marker\`)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX `UQ_payroll_period_one_open` ON `payroll_period`',
    );
    await queryRunner.query(
      'ALTER TABLE `payroll_period` DROP COLUMN `open_marker`',
    );
  }
}
