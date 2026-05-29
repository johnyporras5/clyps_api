import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDescriptionSessionDetail1770911781186 implements MigrationInterface {
  name = 'AddDescriptionSessionDetail1770911781186';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`session\` DROP COLUMN \`description_worker\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`session_detail\` ADD \`description_worker\` text NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`session_detail\` DROP COLUMN \`description_worker\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`session\` ADD \`description_worker\` text NULL`,
    );
  }
}
