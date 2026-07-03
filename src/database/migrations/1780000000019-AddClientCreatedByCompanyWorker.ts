import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddClientCreatedByCompanyWorker1780000000019 implements MigrationInterface {
  name = 'AddClientCreatedByCompanyWorker1780000000019';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `client` ADD COLUMN `created_by_company_worker_id` int NULL',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `client` DROP COLUMN `created_by_company_worker_id`',
    );
  }
}
