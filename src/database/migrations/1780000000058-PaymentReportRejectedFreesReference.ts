import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Un reporte RECHAZADO libera su referencia (SUB-3 / SUB-4).
 *
 * Con el único sobre (company_id, reference) a secas, el dueño que se
 * equivocaba en el monto quedaba atrapado: el admin rechazaba el reporte y ya
 * no podía volver a enviar ESA referencia, que es la única que tiene el pago
 * real. Un reporte rechazado no representa un pago aceptado, así que no debe
 * reservar la referencia para siempre.
 *
 * MySQL no tiene índices parciales, así que se usa una columna generada:
 * `active_reference` vale la referencia mientras el reporte cuenta
 * (`reported`/`verified`) y NULL cuando está rechazado. Como MySQL no considera
 * iguales dos NULL en un índice único, los rechazados dejan de estorbar sin
 * perder la protección contra el doble envío — que sigue siendo cosa de la BD y
 * no solo del servicio, porque dos clics simultáneos pasan cualquier consulta
 * previa.
 */
export class PaymentReportRejectedFreesReference1780000000058 implements MigrationInterface {
  name = 'PaymentReportRejectedFreesReference1780000000058';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX \`UQ_payment_report_company_reference\` ON \`payment_report\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`payment_report\`
         ADD COLUMN \`active_reference\` varchar(64)
         GENERATED ALWAYS AS (
           CASE WHEN \`status\` = 'rejected' THEN NULL ELSE \`reference\` END
         ) STORED`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX \`UQ_payment_report_company_active_reference\`
         ON \`payment_report\` (\`company_id\`, \`active_reference\`)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX \`UQ_payment_report_company_active_reference\` ON \`payment_report\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`payment_report\` DROP COLUMN \`active_reference\``,
    );
    // Volver al único total puede fallar si ya hay referencias repetidas por
    // rechazos: se limpian antes de revertir.
    await queryRunner.query(
      `CREATE UNIQUE INDEX \`UQ_payment_report_company_reference\`
         ON \`payment_report\` (\`company_id\`, \`reference\`)`,
    );
  }
}
