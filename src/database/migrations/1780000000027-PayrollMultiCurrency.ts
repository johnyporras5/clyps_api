import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Nómina multi-moneda por pago en EFECTIVO. Si la cita se cobró en efectivo, la
 * comisión/propina del trabajador queda en su moneda original (USD/EUR) en vez
 * de convertirse a Bs. Se paga en esa moneda.
 * - payroll_concept.currency: moneda de amount_minor (VES por defecto).
 * - payroll_concept.amount_bs_minor: equivalente en Bs (referencia para caja).
 * - payout.currency: en qué moneda se le pagó al trabajador.
 * - period_detail_currency: snapshot congelado POR MONEDA (al aprobar).
 */
export class PayrollMultiCurrency1780000000027 implements MigrationInterface {
  name = 'PayrollMultiCurrency1780000000027';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE `payroll_concept` ADD COLUMN `currency` varchar(3) NOT NULL DEFAULT 'VES'",
    );
    await queryRunner.query(
      'ALTER TABLE `payroll_concept` ADD COLUMN `amount_bs_minor` bigint NULL',
    );
    await queryRunner.query(
      "ALTER TABLE `payout` ADD COLUMN `currency` varchar(3) NOT NULL DEFAULT 'VES'",
    );
    await queryRunner.query(`
      CREATE TABLE \`period_detail_currency\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`period_detail_id\` int NOT NULL,
        \`currency\` varchar(3) NOT NULL,
        \`earned_minor\` bigint NOT NULL DEFAULT 0,
        \`deducted_minor\` bigint NOT NULL DEFAULT 0,
        \`net_minor\` bigint NOT NULL DEFAULT 0,
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`UQ_period_detail_currency\` (\`period_detail_id\`, \`currency\`),
        INDEX \`IDX_pdc_detail\` (\`period_detail_id\`)
      ) ENGINE=InnoDB
    `);
    // Los conceptos ya existentes son todos en Bs: se reflejan como VES con su
    // equivalente = el mismo monto.
    await queryRunner.query(
      'UPDATE `payroll_concept` SET `amount_bs_minor` = `amount_minor` WHERE `amount_bs_minor` IS NULL',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `period_detail_currency`');
    await queryRunner.query('ALTER TABLE `payout` DROP COLUMN `currency`');
    await queryRunner.query(
      'ALTER TABLE `payroll_concept` DROP COLUMN `amount_bs_minor`',
    );
    await queryRunner.query(
      'ALTER TABLE `payroll_concept` DROP COLUMN `currency`',
    );
  }
}
