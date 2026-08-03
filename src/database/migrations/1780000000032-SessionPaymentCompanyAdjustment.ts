import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ajuste a favor/en contra de la company al registrar el cobro: si el cliente
 * paga de más (o de menos) sobre el total calculado, esa diferencia en Bs va
 * 100% a la company (no al trabajador, no es propina). + de más, − de menos.
 * null = sin ajuste (cobro normal). Aditiva; no toca datos existentes.
 */
export class SessionPaymentCompanyAdjustment1780000000032 implements MigrationInterface {
  name = 'SessionPaymentCompanyAdjustment1780000000032';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `session_payments` ADD COLUMN `company_adjustment_bs` decimal(18,2) NULL',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `session_payments` DROP COLUMN `company_adjustment_bs`',
    );
  }
}
