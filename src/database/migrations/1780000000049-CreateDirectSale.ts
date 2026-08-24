import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Venta directa de productos a un cliente sin cita. Crea la tabla cabecera
 * `direct_sale` (pago + deuda) y agrega `direct_sale_id` a `session_product`
 * para enlazar las líneas de la venta.
 */
export class CreateDirectSale1780000000049 implements MigrationInterface {
  name = 'CreateDirectSale1780000000049';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`direct_sale\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`company_id\` int NOT NULL,
        \`client_id\` int NULL,
        \`method\` varchar(30) NULL,
        \`reference\` varchar(64) NULL,
        \`total_bs\` decimal(14,2) NULL,
        \`lines\` json NULL,
        \`collected_at\` datetime NULL,
        \`was_pending\` tinyint NOT NULL DEFAULT 0,
        \`company_adjustment_bs\` decimal(14,2) NULL,
        \`created_by_user_id\` int NULL,
        \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`IDX_direct_sale_company\` (\`company_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(
      `ALTER TABLE \`session_product\` ADD \`direct_sale_id\` int NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`session_product\`
         ADD CONSTRAINT \`FK_session_product_direct_sale\`
         FOREIGN KEY (\`direct_sale_id\`) REFERENCES \`direct_sale\`(\`id\`)
         ON DELETE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`session_product\` DROP FOREIGN KEY \`FK_session_product_direct_sale\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`session_product\` DROP COLUMN \`direct_sale_id\``,
    );
    await queryRunner.query(`DROP TABLE \`direct_sale\``);
  }
}
