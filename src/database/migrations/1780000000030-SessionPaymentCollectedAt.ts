import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cobro "en deuda": la company le paga al trabajador aunque el cliente todavía
 * no pagó. `collected_at` = cuándo la company cobró de verdad al cliente.
 *   - null  → en deuda (se le pagó al worker, la company aún no cobró).
 *   - fecha → cobrado.
 * Los cobros existentes se cobraron al momento, así que collected_at = paid_at.
 */
export class SessionPaymentCollectedAt1780000000030 implements MigrationInterface {
  name = 'SessionPaymentCollectedAt1780000000030';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `session_payments` ADD COLUMN `collected_at` datetime NULL',
    );
    await queryRunner.query(
      'UPDATE `session_payments` SET `collected_at` = `paid_at` WHERE `collected_at` IS NULL',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `session_payments` DROP COLUMN `collected_at`',
    );
  }
}
