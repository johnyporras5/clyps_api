import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Historial de contactos del panel de plataforma: cada vez que el
 * administrador le escribe a un salón (WhatsApp, Instagram, Facebook, TikTok,
 * llamada, correo), queda una fila con el canal, cómo quedó, una nota y,
 * opcionalmente, el día en que toca volver a escribirle.
 *
 * El "estado" de un salón en el panel (último contacto, seguimiento pendiente)
 * es su fila más reciente por `contacted_at`.
 *
 * Canal y resultado son VARCHAR y no ENUM: añadir un canal nuevo es cambiar el
 * DTO, sin migración. Los valores válidos los controla el DTO.
 *
 * Las fechas (`contacted_at`, `created_at`, `updated_at`) las pone SIEMPRE el
 * servicio, no el DEFAULT de MySQL: así todas usan la misma zona horaria que
 * el resto de la app (la del proceso Node).
 *
 * Si se borra el usuario, su historial se va con él (CASCADE).
 */
export class PanelContactLog1780000000087 implements MigrationInterface {
  name = 'PanelContactLog1780000000087';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`panel_contact_log\` (
         \`id\` int NOT NULL AUTO_INCREMENT,
         \`user_id\` int NOT NULL,
         \`channel\` varchar(20) NOT NULL,
         \`outcome\` varchar(20) NOT NULL,
         \`note\` varchar(1000) NULL,
         \`follow_up_on\` date NULL,
         \`contacted_at\` datetime NOT NULL,
         \`created_by\` int NULL,
         \`created_at\` datetime NOT NULL,
         \`updated_at\` datetime NOT NULL,
         PRIMARY KEY (\`id\`),
         INDEX \`IDX_panel_contact_log_user_date\` (\`user_id\`, \`contacted_at\`),
         CONSTRAINT \`FK_panel_contact_log_user\` FOREIGN KEY (\`user_id\`)
           REFERENCES \`user\` (\`id\`) ON DELETE CASCADE
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE \`panel_contact_log\``);
  }
}
