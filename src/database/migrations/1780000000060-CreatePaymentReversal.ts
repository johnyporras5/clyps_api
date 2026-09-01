import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Revertir un cobro (cita pagada → completada). Se archiva TODO el cobro
 * revertido (método, líneas, propinas, atribuciones, descuentos, conceptos de
 * nómina y productos) para auditoría, junto con quién revirtió, cuándo y por qué.
 * No es una tabla de "pagos activos" (esa sigue siendo session_payments): es el
 * historial inmutable de reversiones.
 */
export class CreatePaymentReversal1780000000060 implements MigrationInterface {
  name = 'CreatePaymentReversal1780000000060';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`session_payment_reversal\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`session_id\` int NOT NULL,
        \`company_id\` int NOT NULL,
        \`reverted_by_user_id\` int NOT NULL,
        \`reason\` varchar(255) NOT NULL,
        \`payment_snapshot\` json NOT NULL,
        \`concepts_snapshot\` json NULL,
        \`products_snapshot\` json NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        KEY \`IDX_payment_reversal_session\` (\`session_id\`),
        KEY \`IDX_payment_reversal_company\` (\`company_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE \`session_payment_reversal\``);
  }
}
