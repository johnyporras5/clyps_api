import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * "Cuentas por cobrar": distingue los cobros que nacieron EN DEUDA
 * (pendingCollection) del resto. Sin esto, `collected_at IS NOT NULL` incluía
 * todos los cobros normales en el historial de deudas saldadas.
 *   - was_pending = 1 → cuenta por cobrar (pendiente si collected_at IS NULL,
 *     saldada con el check si collected_at tiene fecha).
 *   - was_pending = 0 → cobro normal, nunca aparece en Cuentas por cobrar.
 *
 * Backfill: las deudas activas actuales (collected_at IS NULL) se marcan como
 * was_pending = 1. Los cobros ya saldados no se pueden distinguir en retrospectiva
 * y quedan en 0 (correcto: el historial arranca limpio).
 */
export class SessionPaymentWasPending1780000000031 implements MigrationInterface {
  name = 'SessionPaymentWasPending1780000000031';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `session_payments` ADD COLUMN `was_pending` tinyint(1) NOT NULL DEFAULT 0',
    );
    await queryRunner.query(
      'UPDATE `session_payments` SET `was_pending` = 1 WHERE `collected_at` IS NULL',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `session_payments` DROP COLUMN `was_pending`',
    );
  }
}
