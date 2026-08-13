import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Flag por company: permite al admin registrar citas con fecha pasada (se crean
 * en estado Completada porque ya ocurrieron). Desactivado por defecto → el
 * pasado se bloquea. Aditiva; no toca datos existentes.
 */
export class CompanyAllowPastAppointments1780000000034 implements MigrationInterface {
  name = 'CompanyAllowPastAppointments1780000000034';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `company` ADD COLUMN `allow_past_appointments` tinyint(1) NOT NULL DEFAULT 0',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `company` DROP COLUMN `allow_past_appointments`',
    );
  }
}
