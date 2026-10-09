import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fecha de alta propia del cliente: `client.created_at`.
 *
 * Hasta ahora se tomaba la de su cuenta (`user.created_at`), y el reporte de
 * clientes nuevos la usa. Un cliente sin correo ya no tiene cuenta, así que
 * sin esta columna dejaría de contar como nuevo hasta su primera cita.
 *
 * Los que ya existen reciben la fecha de su usuario: para ellos el reporte da
 * exactamente lo mismo que antes. Uno que no tuviera usuario (no debería haber)
 * queda con la fecha de la migración, que es lo único que se sabe.
 */
export class ClientCreatedAt1780000000073 implements MigrationInterface {
  name = 'ClientCreatedAt1780000000073';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`client\`
         ADD \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)`,
    );
    await queryRunner.query(
      `UPDATE \`client\` c
         JOIN \`user\` u ON u.\`id\` = c.\`user_id\`
          SET c.\`created_at\` = u.\`created_at\``,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`client\` DROP COLUMN \`created_at\``,
    );
  }
}
