import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFieldsEndDate1770833625088 implements MigrationInterface {
  name = 'AddFieldsEndDate1770833625088';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`session_detail\` ADD \`end_datetime\` datetime NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`session_detail\` DROP COLUMN \`end_datetime\``,
    );
  }
}
