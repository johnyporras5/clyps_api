import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Categorías de movimientos de caja (CLYP-353).
 *
 * Crea `cash_category` y enlaza `cash_transaction.category_id` con una FK
 * RESTRICT: la regla "no se puede eliminar una categoría con movimientos" queda
 * garantizada por la BD, no solo por el servicio. El servicio la valida antes
 * para poder responder un 409 con mensaje útil (y ofrecer la reasignación).
 *
 * El seed de categorías por defecto NO va aquí: es por company y se siembra al
 * abrir caja por primera vez (ver `CashCategoryService.ensureSeeded`), así que
 * las companies que nunca usen el módulo no cargan filas de más.
 */
export class CreateCashCategory1780000000051 implements MigrationInterface {
  name = 'CreateCashCategory1780000000051';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`cash_category\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`company_id\` int NOT NULL,
        \`name\` varchar(145) NOT NULL,
        \`kind\` varchar(10) NOT NULL,
        \`is_active\` tinyint NOT NULL DEFAULT 1,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_cash_category_company_name\` (\`company_id\`, \`name\`),
        CONSTRAINT \`CHK_cash_category_kind\`
          CHECK (\`kind\` IN ('income','expense','both'))
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(
      `ALTER TABLE \`cash_category\`
         ADD CONSTRAINT \`FK_cash_category_company\`
         FOREIGN KEY (\`company_id\`) REFERENCES \`company\`(\`id\`)
         ON DELETE CASCADE`,
    );

    // RESTRICT: borrar una categoría en uso falla a nivel de motor.
    await queryRunner.query(
      `ALTER TABLE \`cash_transaction\`
         ADD CONSTRAINT \`FK_cash_transaction_category\`
         FOREIGN KEY (\`category_id\`) REFERENCES \`cash_category\`(\`id\`)
         ON DELETE RESTRICT`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`cash_transaction\` DROP FOREIGN KEY \`FK_cash_transaction_category\``,
    );
    await queryRunner.query(`DROP TABLE \`cash_category\``);
  }
}
