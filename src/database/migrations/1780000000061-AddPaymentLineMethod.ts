import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Pago mixto (efectivo + resto digital): cada línea del cobro puede llevar su
 * propio método. Ej.: una línea en $ con method='cash' y otra en Bs con
 * method='transfer'. El método de nivel superior (session_payments.method) se
 * mantiene = el método del "resto"/dominante, por compatibilidad.
 */
export class AddPaymentLineMethod1780000000061 implements MigrationInterface {
  name = 'AddPaymentLineMethod1780000000061';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`session_payment_lines\` ADD \`method\` varchar(20) NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`session_payment_lines\` DROP COLUMN \`method\``,
    );
  }
}
