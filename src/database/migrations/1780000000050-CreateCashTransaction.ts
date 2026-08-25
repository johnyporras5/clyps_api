import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Movimientos de caja (CLYP-352): una sola tabla para ingresos y gastos,
 * diferenciados por `kind`.
 *
 * El CHECK sobre `amount_minor` es la red de seguridad de la invariante del
 * ticket: el monto va siempre positivo y el signo lo aporta `kind`. MySQL 8 lo
 * hace cumplir de verdad, así que ningún camino (API, script, import) puede
 * dejar un negativo en la tabla.
 */
export class CreateCashTransaction1780000000050 implements MigrationInterface {
  name = 'CreateCashTransaction1780000000050';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`cash_transaction\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`company_id\` int NOT NULL,
        \`kind\` varchar(10) NOT NULL,
        \`concept\` varchar(145) NOT NULL,
        \`category_id\` int NOT NULL,
        \`amount_minor\` bigint NOT NULL,
        \`date\` date NOT NULL,
        \`payment_method\` varchar(20) NOT NULL,
        \`payment_reference\` varchar(64) NULL,
        \`supplier_name\` varchar(145) NULL,
        \`is_recurring\` tinyint NOT NULL DEFAULT 0,
        \`created_by_user_id\` int NOT NULL,
        \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`IDX_cash_transaction_company_date\` (\`company_id\`, \`date\`),
        CONSTRAINT \`CHK_cash_transaction_amount_positive\`
          CHECK (\`amount_minor\` > 0),
        CONSTRAINT \`CHK_cash_transaction_kind\`
          CHECK (\`kind\` IN ('income','expense'))
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE \`cash_transaction\``);
  }
}
