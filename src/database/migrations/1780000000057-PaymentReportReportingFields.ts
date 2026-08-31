import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Reporte de pago (SUB-3 / CLYP-335). Aditiva sobre `payment_report`.
 *
 * Agrega lo que aporta el dueño al reportar y que SUB-1 no había previsto: la
 * red de la transacción (Binance) y una nota libre.
 *
 * El índice ÚNICO (company_id, reference) es el anti-duplicado del ticket. Va
 * en la BD y no solo en el servicio a propósito: dos toques seguidos del botón
 * "reportar" llegan en paralelo y una consulta previa no los detiene, el índice
 * sí. El índice simple sobre `reference` se conserva: la verificación (SUB-4)
 * busca por referencia sin conocer el tenant.
 */
export class PaymentReportReportingFields1780000000057 implements MigrationInterface {
  name = 'PaymentReportReportingFields1780000000057';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`payment_report\`
         ADD \`network\` varchar(20) NULL,
         ADD \`note\` varchar(255) NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX \`UQ_payment_report_company_reference\`
         ON \`payment_report\` (\`company_id\`, \`reference\`)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX \`UQ_payment_report_company_reference\` ON \`payment_report\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`payment_report\`
         DROP COLUMN \`note\`,
         DROP COLUMN \`network\``,
    );
  }
}
