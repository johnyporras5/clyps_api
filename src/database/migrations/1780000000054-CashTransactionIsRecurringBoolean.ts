import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `is_recurring` como booleano (CLYP-354).
 *
 * La columna se creó como `tinyint` a secas y la API la devolvía como 0/1,
 * mientras `cash_category.is_active` respondía true/false. Dos booleanos de la
 * misma API con formatos distintos obligan al front a tratarlos aparte sin
 * ninguna razón.
 *
 * Es un cambio de ancho: los datos guardados no se tocan.
 */
export class CashTransactionIsRecurringBoolean1780000000054 implements MigrationInterface {
  name = 'CashTransactionIsRecurringBoolean1780000000054';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`cash_transaction\`
         MODIFY \`is_recurring\` tinyint(1) NOT NULL DEFAULT 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`cash_transaction\`
         MODIFY \`is_recurring\` tinyint NOT NULL DEFAULT 0`,
    );
  }
}
