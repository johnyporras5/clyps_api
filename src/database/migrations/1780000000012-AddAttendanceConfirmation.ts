import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAttendanceConfirmation1780000000012
  implements MigrationInterface
{
  name = 'AddAttendanceConfirmation1780000000012';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Confirmación de asistencia del cliente (popup desde el recordatorio).
    // 0 = sin responder, 1 = confirma, 2 = no asistirá.
    await queryRunner.query(
      "ALTER TABLE `session` ADD COLUMN `attendance_status` tinyint NOT NULL DEFAULT 0",
    );
    await queryRunner.query(
      'ALTER TABLE `session` ADD COLUMN `attendance_responded_at` datetime NULL',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `session` DROP COLUMN `attendance_responded_at`',
    );
    await queryRunner.query(
      'ALTER TABLE `session` DROP COLUMN `attendance_status`',
    );
  }
}
