import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * CLYP-318/314: persistir las atribuciones (comisiones/propinas por persona,
 * sobre servicios o productos) del cobro flexible, para poder reconstruir los
 * conceptos de nómina si se borra/reactiva la nómina (botón "Revertir"). Aditiva:
 * agrega `attributions` (JSON, nullable) a `session_payments`. Los cobros viejos
 * quedan en null y siguen reconstruyéndose desde session_detail (sin cambio).
 */
export class AddPaymentAttributions1780000000040 implements MigrationInterface {
  name = 'AddPaymentAttributions1780000000040';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`session_payments\` ADD COLUMN \`attributions\` json NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`session_payments\` DROP COLUMN \`attributions\``,
    );
  }
}
