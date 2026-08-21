import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Productos: economía por producto (costo + comisión % o fija) y registro
 * unificado de ventas para soportar la COMPRA de un trabajador (que se deduce
 * de su nómina, sin comisión). Aditiva:
 *   - `product`: cost_minor, commission_mode, commission_fixed_minor.
 *   - `session_product`: session_id ahora nullable, + sale_type, buyer_employee_id
 *     y los congelados cost_minor / commission_minor.
 * Las ventas existentes quedan sale_type='client' con costo/comisión 0.
 */
export class ProductEconomicsAndWorkerPurchase1780000000047 implements MigrationInterface {
  name = 'ProductEconomicsAndWorkerPurchase1780000000047';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // product: economía
    await queryRunner.query(
      `ALTER TABLE \`product\` ADD COLUMN \`cost_minor\` bigint NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE \`product\` ADD COLUMN \`commission_mode\` varchar(12) NOT NULL DEFAULT 'percentage'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`product\` ADD COLUMN \`commission_fixed_minor\` bigint NOT NULL DEFAULT 0`,
    );

    // session_product: registro unificado de ventas (cliente o trabajador)
    await queryRunner.query(
      `ALTER TABLE \`session_product\` MODIFY COLUMN \`session_id\` int NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`session_product\` ADD COLUMN \`sale_type\` varchar(20) NOT NULL DEFAULT 'client'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`session_product\` ADD COLUMN \`buyer_employee_id\` int NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`session_product\` ADD COLUMN \`cost_minor\` bigint NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE \`session_product\` ADD COLUMN \`commission_minor\` bigint NOT NULL DEFAULT 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`session_product\` DROP COLUMN \`commission_minor\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`session_product\` DROP COLUMN \`cost_minor\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`session_product\` DROP COLUMN \`buyer_employee_id\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`session_product\` DROP COLUMN \`sale_type\``,
    );
    // session_id se deja nullable a propósito: revertirlo a NOT NULL fallaría si
    // ya hay compras de trabajador (session_id null). Es inofensivo.
    await queryRunner.query(
      `ALTER TABLE \`product\` DROP COLUMN \`commission_fixed_minor\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`product\` DROP COLUMN \`commission_mode\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`product\` DROP COLUMN \`cost_minor\``,
    );
  }
}
