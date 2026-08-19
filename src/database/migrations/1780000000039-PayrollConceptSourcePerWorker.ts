import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * CLYP-318: el modelo de atribuciones permite que un mismo ítem (servicio o
 * producto) reparta comisión a VARIAS personas. El índice único de idempotencia
 * era (source_type, source_id, type) → un solo concepto por ítem. Se amplía con
 * period_detail_id (que es por trabajador): permite varias personas por ítem,
 * conserva la trazabilidad e impide duplicar el MISMO concepto (misma persona +
 * mismo ítem + mismo tipo).
 *
 * Solo recrea el índice: no borra ni altera filas. Pasar de 3 a 4 columnas es
 * una restricción más laxa, así que todo dato existente sigue siendo válido.
 */
export class PayrollConceptSourcePerWorker1780000000039 implements MigrationInterface {
  name = 'PayrollConceptSourcePerWorker1780000000039';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `payroll_concept` DROP INDEX `UQ_concept_source`',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX `UQ_concept_source` ON `payroll_concept` (`source_type`, `source_id`, `type`, `period_detail_id`)',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `payroll_concept` DROP INDEX `UQ_concept_source`',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX `UQ_concept_source` ON `payroll_concept` (`source_type`, `source_id`, `type`)',
    );
  }
}
