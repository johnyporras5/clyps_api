import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateNotifications1780000000010 implements MigrationInterface {
  name = 'CreateNotifications1780000000010';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Tabla de notificaciones (feed por usuario). Una fila por destinatario.
    await queryRunner.query(`
      CREATE TABLE \`notifications\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`user_id\` int NOT NULL,
        \`type\` varchar(30) NOT NULL,
        \`title\` varchar(255) NOT NULL,
        \`body\` text NOT NULL,
        \`data\` json NULL,
        \`read\` tinyint(1) NOT NULL DEFAULT 0,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        INDEX \`IDX_notifications_user\` (\`user_id\`),
        INDEX \`IDX_notifications_user_read\` (\`user_id\`, \`read\`),
        CONSTRAINT \`FK_notifications_user\` FOREIGN KEY (\`user_id\`)
          REFERENCES \`user\` (\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Tokens FCM por dispositivo. `token` es único globalmente (upsert por token).
    await queryRunner.query(`
      CREATE TABLE \`fcm_tokens\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`user_id\` int NOT NULL,
        \`token\` varchar(512) NOT NULL,
        \`platform\` varchar(10) NOT NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`UQ_fcm_tokens_token\` (\`token\`),
        INDEX \`IDX_fcm_tokens_user\` (\`user_id\`),
        CONSTRAINT \`FK_fcm_tokens_user\` FOREIGN KEY (\`user_id\`)
          REFERENCES \`user\` (\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `fcm_tokens`');
    await queryRunner.query('DROP TABLE `notifications`');
  }
}
