import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * CLYP-362: descuento en el cobro. Se guarda como dato del payload (auditoría),
 * no como tabla nueva: un JSON en el pago con los descuentos por servicio
 * (mode, value, absorbedBy, workerId, reason). El cálculo (comisiones /
 * total_company / concepto negativo) se resuelve en la misma transacción.
 */
export class AddPaymentDiscounts1780000000054 implements MigrationInterface {
  name = 'AddPaymentDiscounts1780000000054';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`session_payments\` ADD \`discounts\` json NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`session_payments\` DROP COLUMN \`discounts\``,
    );
  }
}
