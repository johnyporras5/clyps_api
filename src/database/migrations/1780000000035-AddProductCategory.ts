import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * CLYP-319: categorías de productos por company (tenant). Aditiva: crea la tabla
 * product_category (name + comisión por defecto opcional en basis points).
 */
export class AddProductCategory1780000000035 implements MigrationInterface {
  name = 'AddProductCategory1780000000035';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`product_category\` (\`id\` int NOT NULL AUTO_INCREMENT, \`name\` varchar(145) NOT NULL, \`company_id\` int NOT NULL, \`default_commission_bps\` int NULL, PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`product_category\` ADD CONSTRAINT \`FK_product_category_company\` FOREIGN KEY (\`company_id\`) REFERENCES \`company\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`product_category\` DROP FOREIGN KEY \`FK_product_category_company\``,
    );
    await queryRunner.query(`DROP TABLE \`product_category\``);
  }
}
