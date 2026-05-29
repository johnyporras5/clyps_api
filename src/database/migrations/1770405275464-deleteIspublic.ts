import { MigrationInterface, QueryRunner } from 'typeorm';

export class DeleteIspublic1770405275464 implements MigrationInterface {
  name = 'DeleteIspublic1770405275464';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`client\` DROP COLUMN \`is_public\``);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`client\` ADD \`is_public\` tinyint NOT NULL DEFAULT '0'`,
    );
  }
}
