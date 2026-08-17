import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * CLYP-320: catálogo de productos. Aditiva: crea `product` y
 * `product_stock_movement`, y agrega `company.allow_negative_stock` (config de
 * venta sin stock; default 1 = permitir negativo, el bloqueo se aplica al
 * vender en CLYP-321).
 */
export class AddProductAndStock1780000000036 implements MigrationInterface {
  name = 'AddProductAndStock1780000000036';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`product\` (\`id\` int NOT NULL AUTO_INCREMENT, \`company_id\` int NOT NULL, \`category_id\` int NOT NULL, \`name\` varchar(145) NOT NULL, \`currency\` varchar(10) NOT NULL DEFAULT 'VES', \`sale_price_minor\` bigint NOT NULL, \`stock\` int NOT NULL DEFAULT 0, \`applies_commission\` tinyint NOT NULL DEFAULT 0, \`commission_bps\` int NULL, PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`product_stock_movement\` (\`id\` int NOT NULL AUTO_INCREMENT, \`product_id\` int NOT NULL, \`delta\` int NOT NULL, \`resulting_stock\` int NOT NULL, \`reason\` varchar(255) NULL, \`created_by_user_id\` int NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), PRIMARY KEY (\`id\`), KEY \`IDX_product_stock_movement_product\` (\`product_id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`product\` ADD CONSTRAINT \`FK_product_company\` FOREIGN KEY (\`company_id\`) REFERENCES \`company\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`product\` ADD CONSTRAINT \`FK_product_category\` FOREIGN KEY (\`category_id\`) REFERENCES \`product_category\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`product_stock_movement\` ADD CONSTRAINT \`FK_product_stock_movement_product\` FOREIGN KEY (\`product_id\`) REFERENCES \`product\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`company\` ADD COLUMN \`allow_negative_stock\` tinyint(1) NOT NULL DEFAULT 1`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`company\` DROP COLUMN \`allow_negative_stock\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`product_stock_movement\` DROP FOREIGN KEY \`FK_product_stock_movement_product\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`product\` DROP FOREIGN KEY \`FK_product_category\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`product\` DROP FOREIGN KEY \`FK_product_company\``,
    );
    await queryRunner.query(`DROP TABLE \`product_stock_movement\``);
    await queryRunner.query(`DROP TABLE \`product\``);
  }
}
