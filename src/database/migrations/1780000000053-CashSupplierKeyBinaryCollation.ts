import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `supplier_key` con collation binaria (CLYP-355).
 *
 * La tabla es utf8mb4_unicode_ci, que al comparar trata 'ñ' y 'n' como la misma
 * letra. Eso anulaba la normalización de la app por partida doble: el LIKE del
 * autocompletado encontraba "Peña" buscando "pena", y —peor— el GROUP BY
 * fusionaba a "Peña" y "Pena" en un solo proveedor.
 *
 * La clave ya llega normalizada desde `normalizeSupplierName` (minúsculas, sin
 * acentos, con la ñ intacta), así que la comparación debe ser exacta: lo que
 * agrupa es lo que la app decidió, no lo que la collation cree.
 */
export class CashSupplierKeyBinaryCollation1780000000053 implements MigrationInterface {
  name = 'CashSupplierKeyBinaryCollation1780000000053';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`cash_transaction\`
         MODIFY \`supplier_key\` varchar(145)
         CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`cash_transaction\`
         MODIFY \`supplier_key\` varchar(145)
         CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL`,
    );
  }
}
