import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropLastNameWorker1780000000005 implements MigrationInterface {
  name = 'DropLastNameWorker1780000000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Colapsar nombre + apellido en la columna name antes de eliminar last_name.
    await queryRunner.query(
      "UPDATE `worker` SET `name` = TRIM(CONCAT(COALESCE(`name`, ''), ' ', COALESCE(`last_name`, ''))) WHERE `last_name` IS NOT NULL AND `last_name` <> ''",
    );
    await queryRunner.query('ALTER TABLE `worker` DROP COLUMN `last_name`');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `worker` ADD `last_name` varchar(145) NULL',
    );
  }
}
