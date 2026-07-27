import { MigrationInterface, QueryRunner } from 'typeorm';

export class FeedbackStateAndDedup1780000000026 implements MigrationInterface {
  name = 'FeedbackStateAndDedup1780000000026';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `session` ADD COLUMN `feedback_skipped_at` datetime NULL',
    );
    await queryRunner.query(
      'ALTER TABLE `worker_feedback` ADD COLUMN `company_worker_id` int NULL',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX `UQ_company_feedback_client_session` ' +
        'ON `company_feedback` (`client_id`, `session_id`, `company_id`)',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX `UQ_worker_feedback_client_session` ' +
        'ON `worker_feedback` (`client_id`, `session_id`, `company_worker_id`)',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX `UQ_worker_feedback_client_session` ON `worker_feedback`',
    );
    await queryRunner.query(
      'DROP INDEX `UQ_company_feedback_client_session` ON `company_feedback`',
    );
    await queryRunner.query(
      'ALTER TABLE `worker_feedback` DROP COLUMN `company_worker_id`',
    );
    await queryRunner.query(
      'ALTER TABLE `session` DROP COLUMN `feedback_skipped_at`',
    );
  }
}
