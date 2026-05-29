import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPictureLength1770399879913 implements MigrationInterface {
  name = 'AddPictureLength1770399879913';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`worker\` DROP COLUMN \`picture\``);
    await queryRunner.query(
      `ALTER TABLE \`worker\` ADD \`picture\` varchar(255) NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`worker\` DROP COLUMN \`picture\``);
    await queryRunner.query(
      `ALTER TABLE \`worker\` ADD \`picture\` varchar(45) NULL`,
    );
  }
}
