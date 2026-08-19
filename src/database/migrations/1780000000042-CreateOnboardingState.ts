import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ONB-1: progreso de onboarding por company (tenant). Aditiva: crea la tabla
 * `onboarding_state` (estado global + los 5 pasos en json + el "ajá" del primer
 * cobro). Los índices sobre (global_status, updated_at) son el barrido de
 * atascados que consume ONB-4.
 */
export class CreateOnboardingState1780000000042 implements MigrationInterface {
  name = 'CreateOnboardingState1780000000042';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`onboarding_state\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`company_id\` int NOT NULL,
        \`global_status\` varchar(16) NOT NULL DEFAULT 'in_progress',
        \`steps\` json NOT NULL,
        \`first_charge_at\` datetime NULL,
        \`started_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`completed_at\` datetime NULL,
        \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`UQ_onboarding_state_company\` (\`company_id\`),
        INDEX \`IDX_onboarding_status\` (\`global_status\`),
        INDEX \`IDX_onboarding_status_updated\` (\`global_status\`, \`updated_at\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await queryRunner.query(
      `ALTER TABLE \`onboarding_state\` ADD CONSTRAINT \`FK_onboarding_state_company\` FOREIGN KEY (\`company_id\`) REFERENCES \`company\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`onboarding_state\` DROP FOREIGN KEY \`FK_onboarding_state_company\``,
    );
    await queryRunner.query(`DROP TABLE \`onboarding_state\``);
  }
}
