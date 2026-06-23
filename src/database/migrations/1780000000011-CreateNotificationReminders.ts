import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateNotificationReminders1780000000011
  implements MigrationInterface
{
  name = 'CreateNotificationReminders1780000000011';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Idempotencia de los jobs cron (§7): una fila por (type, reference_id)
    // indica que ese recordatorio ya se envió.
    await queryRunner.query(`
      CREATE TABLE \`notification_reminders\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`type\` varchar(40) NOT NULL,
        \`reference_id\` int NOT NULL,
        \`sent_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`UQ_notification_reminders_type_ref\` (\`type\`, \`reference_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `notification_reminders`');
  }
}
