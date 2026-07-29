import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Rellena el snapshot por moneda (period_detail_currency) de los periodos que YA
 * estaban aprobados/pagados/cerrados antes de multi-moneda. Sin esto, esos
 * periodos congelados se verían en CERO en la vista por moneda (sus conceptos
 * existen pero la tabla nueva nace vacía y solo se llena al aprobar).
 *
 * Los conceptos previos son todos en Bs (currency = 'VES' por defecto), así que
 * queda una sola fila VES por detalle = el neto congelado. Idempotente: solo
 * inserta donde aún no hay snapshot.
 */
export class BackfillFrozenCurrencySnapshot1780000000029 implements MigrationInterface {
  name = 'BackfillFrozenCurrencySnapshot1780000000029';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO \`period_detail_currency\`
          (\`period_detail_id\`, \`currency\`, \`earned_minor\`, \`deducted_minor\`, \`net_minor\`)
      SELECT c.period_detail_id, c.currency,
             SUM(CASE WHEN c.sign = 1  THEN c.amount_minor ELSE 0 END),
             SUM(CASE WHEN c.sign = -1 THEN c.amount_minor ELSE 0 END),
             SUM(CASE WHEN c.sign = 1  THEN c.amount_minor ELSE 0 END)
               - SUM(CASE WHEN c.sign = -1 THEN c.amount_minor ELSE 0 END)
        FROM payroll_concept c
        JOIN period_detail d ON d.id = c.period_detail_id
        JOIN payroll_period p ON p.id = d.period_id
       WHERE p.status IN ('approved', 'paid', 'closed')
         AND NOT EXISTS (
           SELECT 1 FROM period_detail_currency pdc
            WHERE pdc.period_detail_id = c.period_detail_id
         )
       GROUP BY c.period_detail_id, c.currency
    `);
  }

  public async down(): Promise<void> {
    // No revertible: los datos se recomputan desde los conceptos si hace falta.
  }
}
