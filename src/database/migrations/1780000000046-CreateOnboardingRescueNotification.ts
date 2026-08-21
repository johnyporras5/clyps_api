import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ONB-4: auditoría de los avisos de rescate ya enviados.
 *
 * Es el anti-spam. El cron corre a diario, así que sin esta tabla un dueño
 * atascado 5 días recibiría 5 veces el mismo aviso. El UNIQUE por
 * (company_id, step, level) hace que solo se notifique UNA vez cada
 * combinación; se vuelve a avisar únicamente al ESCALAR — porque cambió el paso
 * donde está trabado, o porque cruzó a un umbral mayor.
 *
 * Mismo patrón de idempotencia que `notification_reminders`.
 */
export class CreateOnboardingRescueNotification1780000000046 implements MigrationInterface {
  name = 'CreateOnboardingRescueNotification1780000000046';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`onboarding_rescue_notification\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`company_id\` int NOT NULL,
        \`step\` varchar(32) NOT NULL,
        \`level\` varchar(16) NOT NULL,
        \`channel\` varchar(24) NOT NULL,
        \`days_stalled\` int NOT NULL DEFAULT 0,
        \`sent_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`UQ_rescue_company_step_level\` (\`company_id\`, \`step\`, \`level\`),
        INDEX \`IDX_rescue_sent_at\` (\`sent_at\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await queryRunner.query(
      `ALTER TABLE \`onboarding_rescue_notification\` ADD CONSTRAINT \`FK_rescue_notification_company\` FOREIGN KEY (\`company_id\`) REFERENCES \`company\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`onboarding_rescue_notification\` DROP FOREIGN KEY \`FK_rescue_notification_company\``,
    );
    await queryRunner.query(`DROP TABLE \`onboarding_rescue_notification\``);
  }
}
