import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cobros de citas (modal "Registrar pago"): un cobro por cita, con sus
 * renglones por moneda y el reparto de propina entre trabajadores.
 *
 * Tasas y montos en Bs se guardan como se cobraron (histórico); nunca se
 * recalculan con tasas futuras.
 */
export class CreateSessionPayments1780000000022 implements MigrationInterface {
  name = 'CreateSessionPayments1780000000022';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`session_payments\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`session_id\` int NOT NULL,
        \`method\` varchar(20) NULL,
        \`reference\` varchar(64) NULL,
        \`tip_currency\` varchar(10) NULL,
        \`tip\` decimal(18,2) NULL,
        \`tip_exchange_rate\` decimal(18,4) NULL,
        \`tip_bs\` decimal(18,2) NULL,
        \`total_bs\` decimal(18,2) NULL,
        \`paid_by\` int NOT NULL,
        \`paid_at\` datetime NOT NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`UQ_session_payments_session_id\` (\`session_id\`),
        INDEX \`IDX_session_payments_paid_at\` (\`paid_at\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE \`session_payment_lines\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`payment_id\` int NOT NULL,
        \`currency\` varchar(10) NOT NULL,
        \`subtotal\` decimal(18,2) NOT NULL,
        \`exchange_rate\` decimal(18,4) NULL,
        \`subtotal_bs\` decimal(18,2) NULL,
        PRIMARY KEY (\`id\`),
        INDEX \`IDX_session_payment_lines_payment_id\` (\`payment_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE \`session_payment_tips\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`payment_id\` int NOT NULL,
        \`company_worker_id\` int NOT NULL,
        \`amount\` decimal(18,2) NOT NULL,
        PRIMARY KEY (\`id\`),
        INDEX \`IDX_session_payment_tips_payment_id\` (\`payment_id\`),
        INDEX \`IDX_session_payment_tips_company_worker_id\` (\`company_worker_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `session_payment_tips`');
    await queryRunner.query('DROP TABLE `session_payment_lines`');
    await queryRunner.query('DROP TABLE `session_payments`');
  }
}
