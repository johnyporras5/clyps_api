import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSessionIdWorkerFeedback1780000000006
  implements MigrationInterface
{
  name = 'AddSessionIdWorkerFeedback1780000000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `worker_feedback` ADD `session_id` int NULL',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `worker_feedback` DROP COLUMN `session_id`',
    );
  }
}
