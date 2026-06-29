import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSiteCategories1780000000014 implements MigrationInterface {
  name = 'CreateSiteCategories1780000000014';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Catálogo global de tipos de negocio del sitio (antes hardcodeado en el
    // front como SITE_CATEGORIES). Lista compartida por toda la plataforma.
    await queryRunner.query(`
      CREATE TABLE \`site_category\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`name\` varchar(145) NOT NULL,
        \`slug\` varchar(100) NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`UQ_site_category_slug\` (\`slug\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `site_category`');
  }
}
