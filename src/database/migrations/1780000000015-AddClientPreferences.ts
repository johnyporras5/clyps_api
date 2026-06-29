import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddClientPreferences1780000000015 implements MigrationInterface {
  name = 'AddClientPreferences1780000000015';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Preferencias del cliente: categorías de interés (ids del catálogo global
    // `site_category`). Se guarda como JSON int[], igual que `client.companies`.
    await queryRunner.query(
      'ALTER TABLE `client` ADD COLUMN `preferences` json NULL',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE `client` DROP COLUMN `preferences`');
  }
}
