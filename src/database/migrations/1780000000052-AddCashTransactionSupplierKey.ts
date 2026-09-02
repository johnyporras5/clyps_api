import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Clave normalizada de proveedor (CLYP-355).
 *
 * `supplier_name` sigue siendo texto libre; `supplier_key` es su versión sin
 * acentos, sin espacios de más y en minúsculas. Es lo que agrupa "Ferretería
 * López" con "ferreteria lopez" en el autocompletado y en los reportes.
 *
 * La llena la entidad en cada guardado (@BeforeInsert/@BeforeUpdate), no la BD:
 * quitar acentos en SQL sería frágil y la ñ hay que respetarla.
 */
export class AddCashTransactionSupplierKey1780000000052 implements MigrationInterface {
  name = 'AddCashTransactionSupplierKey1780000000052';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`cash_transaction\` ADD \`supplier_key\` varchar(145) NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX \`IDX_cash_transaction_company_supplier\`
         ON \`cash_transaction\` (\`company_id\`, \`supplier_key\`)`,
    );

    // Backfill de mínimos (mayúsculas y espacios) para filas previas. Los
    // acentos no se pueden plegar en SQL: si alguna vez hubiera histórico real,
    // se recalcula desde la app con `normalizeSupplierName`.
    await queryRunner.query(
      `UPDATE \`cash_transaction\`
          SET \`supplier_key\` = LOWER(TRIM(\`supplier_name\`))
        WHERE \`supplier_name\` IS NOT NULL AND \`supplier_key\` IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX \`IDX_cash_transaction_company_supplier\` ON \`cash_transaction\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`cash_transaction\` DROP COLUMN \`supplier_key\``,
    );
  }
}
