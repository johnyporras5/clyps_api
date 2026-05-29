import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFieldsCompany1770321567828 implements MigrationInterface {
  name = 'AddFieldsCompany1770321567828';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`service\` ADD \`status\` int NULL`);
    await queryRunner.query(
      `ALTER TABLE \`company\` ADD \`phone\` varchar(20) NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`company\` DROP COLUMN \`phone\``);
    await queryRunner.query(`ALTER TABLE \`service\` DROP COLUMN \`status\``);
  }
}
