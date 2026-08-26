import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Caja multi-moneda (CLYP-352 / 354 / 357).
 *
 * Hasta aquí `amount_minor` significaba "céntimos de Bs" y el dueño que pagaba
 * en dólares tenía que convertir a mano. Ahora significa "céntimos de SU
 * moneda", y `amount_bs_minor` guarda el equivalente en Bs a la tasa del día —
 * mismo criterio que `payroll_concept` y que los cobros: la tasa se congela, no
 * se recalcula nunca con tasas futuras.
 *
 * Los movimientos ya cargados eran todos en Bs, así que el relleno es directo:
 * currency = VES y amount_bs_minor = amount_minor.
 */
export class CashTransactionMultiCurrency1780000000055 implements MigrationInterface {
  name = 'CashTransactionMultiCurrency1780000000055';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`cash_transaction\`
         ADD \`currency\` varchar(3) NOT NULL DEFAULT 'VES',
         ADD \`exchange_rate\` decimal(18,4) NULL,
         ADD \`amount_bs_minor\` bigint NULL`,
    );

    // Lo existente era Bs por definición: el equivalente es el mismo monto.
    await queryRunner.query(
      `UPDATE \`cash_transaction\` SET \`amount_bs_minor\` = \`amount_minor\``,
    );

    // Recién con todas las filas rellenas se puede exigir el NOT NULL.
    await queryRunner.query(
      `ALTER TABLE \`cash_transaction\`
         MODIFY \`amount_bs_minor\` bigint NOT NULL`,
    );

    // El equivalente en Bs también es siempre positivo: el signo lo da `kind`.
    await queryRunner.query(
      `ALTER TABLE \`cash_transaction\`
         ADD CONSTRAINT \`CHK_cash_transaction_amount_bs_positive\`
         CHECK (\`amount_bs_minor\` > 0)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`cash_transaction\`
         DROP CHECK \`CHK_cash_transaction_amount_bs_positive\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`cash_transaction\`
         DROP COLUMN \`amount_bs_minor\`,
         DROP COLUMN \`exchange_rate\`,
         DROP COLUMN \`currency\``,
    );
  }
}
