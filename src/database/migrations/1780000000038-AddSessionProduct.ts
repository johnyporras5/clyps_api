import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * CLYP-321: venta de producto en el cobro. Aditiva: crea `session_product`
 * (hermana de session_detail, solo productos). Cada fila es una venta: congela
 * precio/moneda, guarda el vendedor y sostiene el stock.
 */
export class AddSessionProduct1780000000038 implements MigrationInterface {
  name = 'AddSessionProduct1780000000038';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`session_product\` (\`id\` int NOT NULL AUTO_INCREMENT, \`company_id\` int NOT NULL, \`session_id\` int NOT NULL, \`product_id\` int NOT NULL, \`quantity\` int NOT NULL, \`unit_price_minor\` bigint NOT NULL, \`currency\` varchar(10) NOT NULL DEFAULT 'VES', \`seller_employee_id\` int NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), PRIMARY KEY (\`id\`), KEY \`IDX_session_product_session\` (\`session_id\`), KEY \`IDX_session_product_company\` (\`company_id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`session_product\` ADD CONSTRAINT \`FK_session_product_company\` FOREIGN KEY (\`company_id\`) REFERENCES \`company\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`session_product\` ADD CONSTRAINT \`FK_session_product_session\` FOREIGN KEY (\`session_id\`) REFERENCES \`session\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`session_product\` ADD CONSTRAINT \`FK_session_product_product\` FOREIGN KEY (\`product_id\`) REFERENCES \`product\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`session_product\` ADD CONSTRAINT \`FK_session_product_seller\` FOREIGN KEY (\`seller_employee_id\`) REFERENCES \`company_worker\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`session_product\` DROP FOREIGN KEY \`FK_session_product_seller\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`session_product\` DROP FOREIGN KEY \`FK_session_product_product\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`session_product\` DROP FOREIGN KEY \`FK_session_product_session\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`session_product\` DROP FOREIGN KEY \`FK_session_product_company\``,
    );
    await queryRunner.query(`DROP TABLE \`session_product\``);
  }
}
