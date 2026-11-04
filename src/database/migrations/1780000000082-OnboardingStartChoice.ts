import { MigrationInterface, QueryRunner } from 'typeorm';

export class OnboardingStartChoice1780000000082 implements MigrationInterface {
  name = 'OnboardingStartChoice1780000000082';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`onboarding_state\`
        ADD COLUMN \`start_choice\` varchar(16) NULL AFTER \`wizard_step\`
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`onboarding_state\`
        DROP COLUMN \`start_choice\`
    `);
  }
}
