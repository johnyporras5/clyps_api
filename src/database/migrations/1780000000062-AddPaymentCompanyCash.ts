import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Pago mixto (efectivo + resto en Bs): el efectivo se reparte 50/50 entre el
 * ejecutor (barbero) y la company. Para reflejar en los reportes cuánto del
 * efectivo le tocó al NEGOCIO, se guarda esa porción en el cobro:
 *   - `company_cash_minor`   → monto en unidades mínimas de la moneda del servicio.
 *   - `company_cash_currency`→ moneda de ese efectivo ($/€).
 * La porción del barbero queda en sus conceptos de nómina (parte en efectivo).
 */
export class AddPaymentCompanyCash1780000000062 implements MigrationInterface {
  name = 'AddPaymentCompanyCash1780000000062';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`session_payments\` ADD \`company_cash_minor\` bigint NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`session_payments\` ADD \`company_cash_currency\` varchar(10) NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`session_payments\` DROP COLUMN \`company_cash_currency\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`session_payments\` DROP COLUMN \`company_cash_minor\``,
    );
  }
}
