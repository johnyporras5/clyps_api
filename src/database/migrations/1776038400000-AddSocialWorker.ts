import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSocialWorker1776038400000 implements MigrationInterface {
  name = 'AddSocialWorker1776038400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`worker\` ADD \`instagram_url\` varchar(245) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`worker\` ADD \`tiktok_url\` varchar(245) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`worker\` ADD \`facebook_url\` varchar(245) NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`worker\` DROP COLUMN \`facebook_url\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`worker\` DROP COLUMN \`tiktok_url\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`worker\` DROP COLUMN \`instagram_url\``,
    );
  }
}
