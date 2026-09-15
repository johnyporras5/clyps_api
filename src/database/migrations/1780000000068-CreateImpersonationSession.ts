import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bitácora de accesos del administrador de la plataforma a un salón ajeno
 * (CLYP-IMP). Aditiva: crea una tabla nueva y no toca ninguna existente.
 *
 * El acceso se concede sin pedir la contraseña del operador y con permisos
 * completos de escritura. Esta tabla es, por tanto, el único rastro de quién
 * entró a los datos de qué salón — y la única forma de cortar una sesión ya
 * entregada. Sin ella la función no debería existir.
 *
 * `ticket_hash` es ÚNICO y no un simple índice: es la defensa de base de datos
 * contra que dos sesiones nazcan con el mismo vale. Dos peticiones simultáneas
 * pasan cualquier comprobación hecha en memoria; el índice no.
 */
export class CreateImpersonationSession1780000000068 implements MigrationInterface {
  name = 'CreateImpersonationSession1780000000068';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`impersonation_session\` (
         \`id\` int NOT NULL AUTO_INCREMENT,
         \`actor_user_id\` int NOT NULL
           COMMENT 'El padm que pidió el acceso',
         \`actor_email\` varchar(245) NULL
           COMMENT 'Copia del correo del operador en ese momento',
         \`target_user_id\` int NOT NULL
           COMMENT 'El dueño (adm) en cuyo nombre se actúa',
         \`company_id\` int NOT NULL,
         \`ticket_hash\` char(64) NULL
           COMMENT 'SHA-256 del vale de un solo uso. NULL una vez canjeado',
         \`ticket_expires_at\` datetime NOT NULL,
         \`ticket_used_at\` datetime NULL,
         \`token_hash\` char(64) NULL
           COMMENT 'SHA-256 del JWT emitido. Permite revocarlo sin tenerlo',
         \`token_expires_at\` datetime NULL,
         \`started_at\` datetime NULL
           COMMENT 'Cuándo se canjeó el ticket',
         \`ended_at\` datetime NULL,
         \`ended_reason\` varchar(16) NULL
           COMMENT 'manual | revoked | expired',
         \`ip\` varchar(45) NULL,
         \`user_agent\` varchar(255) NULL,
         \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
         PRIMARY KEY (\`id\`),
         UNIQUE INDEX \`UQ_impersonation_ticket\` (\`ticket_hash\`),
         INDEX \`IDX_impersonation_active\` (\`ended_at\`, \`token_expires_at\`),
         INDEX \`IDX_impersonation_company\` (\`company_id\`, \`created_at\`)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE \`impersonation_session\``);
  }
}
