import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tasa histórica (Bs por 1 unidad de la moneda del negocio) de un concepto
 * manual, capturada al crearlo. El reporte del trabajador (en $/€) la usa para
 * convertir un concepto en Bs a la moneda de los servicios. Aditiva; nullable.
 */
export class PayrollConceptExchangeRate1780000000033 implements MigrationInterface {
  name = 'PayrollConceptExchangeRate1780000000033';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `payroll_concept` ADD COLUMN `exchange_rate` decimal(18,4) NULL',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `payroll_concept` DROP COLUMN `exchange_rate`',
    );
  }
}
