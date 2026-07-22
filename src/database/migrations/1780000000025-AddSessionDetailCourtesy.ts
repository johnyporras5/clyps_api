import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSessionDetailCourtesy1780000000025 implements MigrationInterface {
  name = 'AddSessionDetailCourtesy1780000000025';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Servicio de cortesía: se presta pero no se cobra. Precio 0, sin comisión,
    // no cuenta como ingreso ni servicio pagado. Por defecto false (normal).
    await queryRunner.query(
      'ALTER TABLE `session_detail` ADD COLUMN `is_courtesy` tinyint(1) NOT NULL DEFAULT 0',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `session_detail` DROP COLUMN `is_courtesy`',
    );
  }
}
