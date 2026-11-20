import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * BE-OFF-3: cuándo se creó DE VERDAD una cita o un cliente en la app sin red
 * (`createdOfflineAt`, lo manda el teléfono al sincronizar). NULL = se creó
 * con conexión, como siempre.
 *
 * Sirve para aceptar una cita agendada sin red antes de su hora aunque llegue
 * al servidor cuando ya pasó.
 */
export class CreatedOfflineAt1780000000090 implements MigrationInterface {
  name = 'CreatedOfflineAt1780000000090';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`session\` ADD \`created_offline_at\` datetime NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`client\` ADD \`created_offline_at\` datetime NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`client\` DROP COLUMN \`created_offline_at\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`session\` DROP COLUMN \`created_offline_at\``,
    );
  }
}
