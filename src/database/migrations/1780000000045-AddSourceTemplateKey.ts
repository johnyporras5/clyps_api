import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ONB-3: rastro de qué categorías/servicios nacieron de una plantilla de
 * onboarding. Aditiva y nullable: todo lo existente queda en NULL y nada cambia
 * de comportamiento.
 *
 * Es la llave de idempotencia de POST /onboarding/services/confirm: si el dueño
 * vuelve a la pantalla, cambia precios y reenvía, se busca por
 * (company_id, source_template_key) y se ACTUALIZA en vez de duplicar.
 */
export class AddSourceTemplateKey1780000000045 implements MigrationInterface {
  name = 'AddSourceTemplateKey1780000000045';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`service_category\` ADD COLUMN \`source_template_key\` varchar(64) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`service\` ADD COLUMN \`source_template_key\` varchar(64) NULL`,
    );
    // Índices para el get-or-create del confirm (lookup por tenant + plantilla).
    await queryRunner.query(
      `CREATE INDEX \`IDX_service_category_source_template\` ON \`service_category\` (\`company_id\`, \`source_template_key\`)`,
    );
    await queryRunner.query(
      `CREATE INDEX \`IDX_service_source_template\` ON \`service\` (\`company_id\`, \`source_template_key\`)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX \`IDX_service_source_template\` ON \`service\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_service_category_source_template\` ON \`service_category\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`service\` DROP COLUMN \`source_template_key\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`service_category\` DROP COLUMN \`source_template_key\``,
    );
  }
}
