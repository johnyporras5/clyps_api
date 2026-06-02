import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSessionIdCompanyFeedback1780000000007 implements MigrationInterface {
  name = 'AddSessionIdCompanyFeedback1780000000007';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `company_feedback` ADD `session_id` int NULL',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `company_feedback` DROP COLUMN `session_id`',
    );
  }
}
