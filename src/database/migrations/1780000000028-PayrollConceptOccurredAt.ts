import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fecha/hora REAL del concepto (cuándo se cobró la cita), separada de created_at
 * (cuándo se insertó la fila). Importa por el backfill: los conceptos traídos de
 * cobros viejos se insertan hoy, pero deben mostrar la fecha del cobro original.
 */
export class PayrollConceptOccurredAt1780000000028 implements MigrationInterface {
  name = 'PayrollConceptOccurredAt1780000000028';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `payroll_concept` ADD COLUMN `occurred_at` datetime NULL',
    );
    // Los ya existentes se crearon en el momento del cobro (flujo en vivo), así
    // que created_at ≈ la fecha real.
    await queryRunner.query(
      'UPDATE `payroll_concept` SET `occurred_at` = `created_at` WHERE `occurred_at` IS NULL',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `payroll_concept` DROP COLUMN `occurred_at`',
    );
  }
}
