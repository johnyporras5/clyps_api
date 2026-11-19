import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * BE-OFF-1: recibos de idempotencia para crear cita y crear cliente.
 *
 * La app guarda sin red lo que el negocio crea y lo envía al volver la
 * conexión, con un header `Idempotency-Key` que no cambia entre reintentos. Si
 * el servidor ya procesó esa clave, devuelve la respuesta guardada en vez de
 * crear un duplicado.
 *
 * - La clave es única POR USUARIO (`user_id` del token), nunca global: un
 *   usuario no puede leer la respuesta guardada de otro aunque conozca su clave.
 * - `request_hash` detecta que se reusó la clave con OTRO contenido.
 * - `status`: `processing` mientras corre la petición, `done` con la respuesta.
 * - Las filas se borran a los 30 días (cron en IdempotencyService).
 *
 * Las fechas las pone SIEMPRE el servicio, no el DEFAULT de MySQL, para usar
 * la misma zona horaria que el resto de la app.
 */
export class IdempotencyKeys1780000000088 implements MigrationInterface {
  name = 'IdempotencyKeys1780000000088';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`idempotency_key\` (
         \`id\` int NOT NULL AUTO_INCREMENT,
         \`user_id\` int NOT NULL,
         \`idem_key\` char(36) NOT NULL,
         \`endpoint\` varchar(100) NOT NULL,
         \`request_hash\` char(64) NOT NULL,
         \`status\` varchar(12) NOT NULL,
         \`response_body\` mediumtext NULL,
         \`created_at\` datetime NOT NULL,
         \`completed_at\` datetime NULL,
         PRIMARY KEY (\`id\`),
         UNIQUE INDEX \`UQ_idempotency_key_user_key\` (\`user_id\`, \`idem_key\`),
         INDEX \`IDX_idempotency_key_created\` (\`created_at\`),
         CONSTRAINT \`FK_idempotency_key_user\` FOREIGN KEY (\`user_id\`)
           REFERENCES \`user\` (\`id\`) ON DELETE CASCADE
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE \`idempotency_key\``);
  }
}
