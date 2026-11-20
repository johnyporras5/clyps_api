import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * BE-OFF-4: `?since=` para que la app baje solo lo que cambió.
 *
 * 1. `updated_at` en las tablas de catálogo. Lo pone LA BASE DE DATOS
 *    (`ON UPDATE CURRENT_TIMESTAMP(6)`), igual que ya pasa en `session`,
 *    `session_detail` y `user`: así cualquier cambio lo actualiza, también los
 *    que van dentro de un JSON (precio por trabajador en `service.workers`,
 *    servicios asignados en `company_worker.services_detail`, horario en
 *    `company_worker.calendar`) y los que se hacen con SQL a mano. No depende
 *    de que cada parte del código se acuerde.
 *
 *    Va en UTC (el reloj de la base). NO se mapea en las entidades a
 *    propósito: si TypeORM lo escribiera, pondría la hora de Caracas.
 *
 *    Las filas que ya existen quedan con la hora de esta migración: la primera
 *    sincronización con `since` después de subir esto baja todo, una vez.
 *
 * 2. `catalog_deletion`: lo que se borra DE VERDAD (fila eliminada) no puede
 *    avisarse con `updated_at`. Se anota aquí y se guarda 90 días.
 *
 * 3. Índice `session(client_id, updated_at)`: la lista de clientes pregunta
 *    "¿este cliente tuvo citas nuevas desde X?" y la tabla no tenía índice
 *    por cliente.
 */
export class CatalogSyncSince1780000000091 implements MigrationInterface {
  name = 'CatalogSyncSince1780000000091';

  private readonly tables = [
    'service',
    'company_worker',
    'worker',
    'client',
    'calendar_company',
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of this.tables) {
      await queryRunner.query(
        `ALTER TABLE \`${table}\`
           ADD \`updated_at\` datetime(6) NOT NULL
             DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)`,
      );
    }

    await queryRunner.query(
      `CREATE INDEX \`IDX_service_company_updated\` ON \`service\` (\`company_id\`, \`updated_at\`)`,
    );
    await queryRunner.query(
      `CREATE INDEX \`IDX_company_worker_company_updated\` ON \`company_worker\` (\`company_id\`, \`updated_at\`)`,
    );
    await queryRunner.query(
      `CREATE INDEX \`IDX_client_updated\` ON \`client\` (\`updated_at\`)`,
    );
    await queryRunner.query(
      `CREATE INDEX \`IDX_session_client_updated\` ON \`session\` (\`client_id\`, \`updated_at\`)`,
    );
    await queryRunner.query(
      `CREATE INDEX \`IDX_session_detail_worker_updated\` ON \`session_detail\` (\`company_worker_id\`, \`updated_at\`)`,
    );

    await queryRunner.query(
      `CREATE TABLE \`catalog_deletion\` (
         \`id\` int NOT NULL AUTO_INCREMENT,
         \`company_id\` int NOT NULL,
         \`entity\` varchar(30) NOT NULL,
         \`entity_id\` int NOT NULL,
         \`deleted_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
         PRIMARY KEY (\`id\`),
         INDEX \`IDX_catalog_deletion_lookup\` (\`company_id\`, \`entity\`, \`deleted_at\`),
         INDEX \`IDX_catalog_deletion_deleted_at\` (\`deleted_at\`)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE \`catalog_deletion\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_session_detail_worker_updated\` ON \`session_detail\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_session_client_updated\` ON \`session\``,
    );
    await queryRunner.query(`DROP INDEX \`IDX_client_updated\` ON \`client\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_company_worker_company_updated\` ON \`company_worker\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_service_company_updated\` ON \`service\``,
    );
    for (const table of [...this.tables].reverse()) {
      await queryRunner.query(
        `ALTER TABLE \`${table}\` DROP COLUMN \`updated_at\``,
      );
    }
  }
}
