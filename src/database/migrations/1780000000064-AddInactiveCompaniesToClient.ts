import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Desactivación de clientes por compañía.
 *
 * Antes `client.is_active` era global: si un salón desactivaba a un cliente que
 * también iba a otro salón, quedaba inactivo para los dos. Se agrega
 * `inactive_companies` (JSON con los ids de las compañías donde ese cliente
 * está desactivado) y se migran los clientes hoy desactivados a la nueva
 * bandera: quedan inactivos en TODOS sus salones actuales, que es exactamente
 * el estado que tienen ahora, y a partir de ahí cada salón maneja el suyo.
 *
 * No se tocan los clientes con borrado suave (`temporarily_deleted` /
 * `permanently_deleted`): esos siguen apoyándose en la bandera global.
 */
export class AddInactiveCompaniesToClient1780000000064 implements MigrationInterface {
  name = 'AddInactiveCompaniesToClient1780000000064';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`client\` ADD COLUMN \`inactive_companies\` JSON NULL`,
    );

    await queryRunner.query(
      `UPDATE \`client\`
          SET \`inactive_companies\` = \`companies\`,
              \`is_active\` = 1
        WHERE \`is_active\` = 0
          AND \`temporarily_deleted\` = 0
          AND \`permanently_deleted\` = 0
          AND \`companies\` IS NOT NULL
          AND JSON_LENGTH(\`companies\`) > 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Se devuelve el estado a la bandera global antes de perder la columna.
    await queryRunner.query(
      `UPDATE \`client\`
          SET \`is_active\` = 0
        WHERE \`inactive_companies\` IS NOT NULL
          AND JSON_LENGTH(\`inactive_companies\`) > 0
          AND \`temporarily_deleted\` = 0
          AND \`permanently_deleted\` = 0`,
    );

    await queryRunner.query(
      `ALTER TABLE \`client\` DROP COLUMN \`inactive_companies\``,
    );
  }
}
