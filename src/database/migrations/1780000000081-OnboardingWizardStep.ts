import { MigrationInterface, QueryRunner } from 'typeorm';

export class OnboardingWizardStep1780000000081 implements MigrationInterface {
  name = 'OnboardingWizardStep1780000000081';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`onboarding_state\`
        ADD COLUMN \`wizard_step\` varchar(32) NULL AFTER \`steps\`
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`onboarding_state\`
        DROP COLUMN \`wizard_step\`
    `);
  }
}
