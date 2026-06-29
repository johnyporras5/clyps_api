import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddServiceForCommunity1780000000017 implements MigrationInterface {
  name = 'AddServiceForCommunity1780000000017';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Servicios "para la comunidad": los gestionan admin/worker directamente y
    // NO se muestran al cliente. Por defecto false (servicio normal).
    await queryRunner.query(
      'ALTER TABLE `service` ADD COLUMN `for_community` tinyint(1) NOT NULL DEFAULT 0',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `service` DROP COLUMN `for_community`',
    );
  }
}
