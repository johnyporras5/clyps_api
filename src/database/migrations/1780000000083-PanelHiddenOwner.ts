import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Filas que el administrador de la plataforma ocultó de la lista "Compañías
 * registradas" del panel.
 *
 * NO es un borrado ni una desactivación: el salón y su dueño siguen igual,
 * entran a la app y funcionan. Solo dejan de salir en esa lista. Volver a
 * mostrarlos es borrar la fila de esta tabla.
 *
 * Va por la CUENTA del dueño (`user_id`) y no por el salón porque cada fila del
 * panel es un dueño, y hay dueños sin salón ("Sin salón") que también se
 * quieren ocultar. Tabla aparte, y no una columna en `user` o `company`, para
 * no tocar las entidades que usa toda la app.
 *
 * Si se borra el usuario, su marca se va con él (CASCADE).
 */
export class PanelHiddenOwner1780000000083 implements MigrationInterface {
  name = 'PanelHiddenOwner1780000000083';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`panel_hidden_owner\` (
         \`user_id\` int NOT NULL,
         \`hidden_by\` int NULL,
         \`hidden_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
         PRIMARY KEY (\`user_id\`),
         CONSTRAINT \`FK_panel_hidden_owner_user\` FOREIGN KEY (\`user_id\`)
           REFERENCES \`user\` (\`id\`) ON DELETE CASCADE
       ) ENGINE=InnoDB`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE \`panel_hidden_owner\``);
  }
}
