import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Hora AGENDADA original (para el arrastre / ripple del calendario).
 */
export class AddOriginalDatetimeToSessions1780000000020 implements MigrationInterface {
  name = 'AddOriginalDatetimeToSessions1780000000020';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `session_detail` ADD COLUMN `original_start_datetime` datetime NULL',
    );
    await queryRunner.query(
      'ALTER TABLE `session_detail` ADD COLUMN `original_end_datetime` datetime NULL',
    );
    await queryRunner.query(
      'ALTER TABLE `session` ADD COLUMN `original_start_datetime` datetime NULL',
    );

    // Backfill del histórico con la hora que ya tienen.
    await queryRunner.query(
      'UPDATE `session_detail` SET `original_start_datetime` = `start_datetime`, `original_end_datetime` = `end_datetime`',
    );
    await queryRunner.query(
      'UPDATE `session` SET `original_start_datetime` = COALESCE(`start_datetime`, `session_datetime`)',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `session` DROP COLUMN `original_start_datetime`',
    );
    await queryRunner.query(
      'ALTER TABLE `session_detail` DROP COLUMN `original_end_datetime`',
    );
    await queryRunner.query(
      'ALTER TABLE `session_detail` DROP COLUMN `original_start_datetime`',
    );
  }
}
