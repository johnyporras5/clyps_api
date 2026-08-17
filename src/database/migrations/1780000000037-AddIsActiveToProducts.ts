import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Activar/desactivar categorías y productos (relacionado con CLYP-317). Aditiva:
 * agrega `is_active` (default 1) a `product_category` y `product`. Todo lo
 * existente queda activo.
 */
export class AddIsActiveToProducts1780000000037 implements MigrationInterface {
  name = 'AddIsActiveToProducts1780000000037';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`product_category\` ADD COLUMN \`is_active\` tinyint(1) NOT NULL DEFAULT 1`,
    );
    await queryRunner.query(
      `ALTER TABLE \`product\` ADD COLUMN \`is_active\` tinyint(1) NOT NULL DEFAULT 1`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`product\` DROP COLUMN \`is_active\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`product_category\` DROP COLUMN \`is_active\``,
    );
  }
}
