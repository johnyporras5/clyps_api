import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddColumnPhone1767884309052 implements MigrationInterface {
  name = 'AddColumnPhone1767884309052';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`worker\` ADD \`phone\` varchar(20) NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`worker\` DROP COLUMN \`phone\``);
  }
}
