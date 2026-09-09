import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * El ciclo de facturación que cubrió cada pago (SUB-13 / CLYP-342). Aditiva.
 *
 * El historial del dueño tiene que decir "este pago te cubrió del 5 de octubre
 * al 5 de noviembre", y esa respuesta HOY no se puede reconstruir: la
 * suscripción solo guarda `current_period_end`, la foto de ahora. Con dos pagos
 * seguidos, el primero pierde para siempre el rango que compró.
 *
 * Por eso el rango se CONGELA en el reporte al verificarlo, igual que ya se
 * congelan el monto y la tasa: el historial no puede cambiar porque después se
 * haya pagado otro mes o se haya corregido una fecha a mano.
 *
 * Nulo mientras el pago no esté verificado: un pago reportado o rechazado no
 * compró ningún ciclo. Lo que el historial muestra en ese caso es el ciclo al
 * que APUNTABA, calculado al vuelo y marcado como estimado.
 *
 * El relleno saca el rango de `subscription_event`, que sí guardó qué período
 * dejó cada pago. Para el PRIMER pago de cada tenant no hay período anterior
 * (`previous_period_end` en null) porque el mes arrancó desde la prueba o desde
 * la fecha del pago: ahí se retrocede un mes desde el final, que es exactamente
 * lo que ese pago compró.
 */
export class PaymentReportCoveredPeriod1780000000067 implements MigrationInterface {
  name = 'PaymentReportCoveredPeriod1780000000067';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`payment_report\`
         ADD COLUMN \`covered_from\` datetime NULL
           COMMENT 'Inicio del ciclo que pagó. Congelado al verificar',
         ADD COLUMN \`covered_to\` datetime NULL
           COMMENT 'Fin del ciclo que pagó. Es el current_period_end que dejó'`,
    );

    // El historial del tenant: sus pagos, del más reciente al más viejo.
    await queryRunner.query(
      `CREATE INDEX \`IDX_payment_report_company_reported\`
         ON \`payment_report\` (\`company_id\`, \`reported_at\`)`,
    );

    await queryRunner.query(
      `UPDATE \`payment_report\` \`report\`
         JOIN \`subscription_event\` \`event\`
           ON \`event\`.\`payment_report_id\` = \`report\`.\`id\`
        SET \`report\`.\`covered_to\` = \`event\`.\`new_period_end\`,
            \`report\`.\`covered_from\` = COALESCE(
              \`event\`.\`previous_period_end\`,
              DATE_SUB(\`event\`.\`new_period_end\`, INTERVAL 1 MONTH)
            )
      WHERE \`report\`.\`status\` = 'verified'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX \`IDX_payment_report_company_reported\` ON \`payment_report\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`payment_report\`
         DROP COLUMN \`covered_to\`,
         DROP COLUMN \`covered_from\``,
    );
  }
}
