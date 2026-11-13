import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Promo Black Friday: un pago puede comprar varios meses de una vez, a un
 * precio de oferta, o la mejora Básico → Full.
 *
 * En `payment_report` y en `subscription_invoice` (el cobro de Cobrix, del que
 * después nace el reporte):
 *   - `kind`: 'regular' (el mes normal), 'promo' o 'promo_upgrade'.
 *   - `offer_id`: qué oferta se pagó (NULL en los regulares).
 *   - `months`: meses que suma al verificarse (0 en la mejora: no suma).
 *   - `price_usd_minor`: el precio que se cobró, CONGELADO al abrir el pago. Así
 *     la revisión del monto y el historial no dependen de que el catálogo siga
 *     igual. NULL = el precio del plan (todos los pagos de antes).
 *
 * "Una sola vez por salón" lo garantiza la BASE, no solo el código: la columna
 * generada `promo_slot` vale "<campaña>:<kind>" mientras el pago esté vivo
 * (reportado o verificado) y NULL si es regular o fue rechazado. Con un único
 * sobre (company_id, promo_slot), dos reportes simultáneos de la promo no
 * pueden pasar los dos; uno rechazado libera el lugar para reintentar.
 *
 * Los pagos que ya existen quedan como 'regular' de 1 mes: no cambia nada.
 */
export class PaymentOffers1780000000084 implements MigrationInterface {
  name = 'PaymentOffers1780000000084';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`payment_report\`
         ADD \`kind\` varchar(16) NOT NULL DEFAULT 'regular',
         ADD \`offer_id\` varchar(32) NULL,
         ADD \`months\` tinyint UNSIGNED NOT NULL DEFAULT 1,
         ADD \`price_usd_minor\` int NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`payment_report\`
         ADD \`promo_slot\` varchar(48) AS (
           CASE
             WHEN \`offer_id\` IS NOT NULL AND \`status\` <> 'rejected'
               THEN CONCAT(SUBSTRING_INDEX(\`offer_id\`, '_', 1), ':', \`kind\`)
             ELSE NULL
           END
         ) STORED`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX \`UQ_payment_report_company_promo_slot\`
         ON \`payment_report\` (\`company_id\`, \`promo_slot\`)`,
    );
    await queryRunner.query(
      `ALTER TABLE \`subscription_invoice\`
         ADD \`kind\` varchar(16) NOT NULL DEFAULT 'regular',
         ADD \`offer_id\` varchar(32) NULL,
         ADD \`months\` tinyint UNSIGNED NOT NULL DEFAULT 1,
         ADD \`price_usd_minor\` int NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`subscription_invoice\`
         DROP COLUMN \`price_usd_minor\`,
         DROP COLUMN \`months\`,
         DROP COLUMN \`offer_id\`,
         DROP COLUMN \`kind\``,
    );
    await queryRunner.query(
      `DROP INDEX \`UQ_payment_report_company_promo_slot\` ON \`payment_report\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`payment_report\`
         DROP COLUMN \`promo_slot\`,
         DROP COLUMN \`price_usd_minor\`,
         DROP COLUMN \`months\`,
         DROP COLUMN \`offer_id\`,
         DROP COLUMN \`kind\``,
    );
  }
}
