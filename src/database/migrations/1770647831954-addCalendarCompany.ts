import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCalendarCompany1770647831954 implements MigrationInterface {
  name = 'AddCalendarCompany1770647831954';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`calendar_company\` (\`id\` int NOT NULL AUTO_INCREMENT, \`calendar_detail\` json NULL, \`status\` varchar(45) NULL, \`company_id\` int NOT NULL, PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`calendar_company\` ADD CONSTRAINT \`FK_bd2cc6847ea8f585bf4f76dec3a\` FOREIGN KEY (\`company_id\`) REFERENCES \`company\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`calendar_company\` DROP FOREIGN KEY \`FK_bd2cc6847ea8f585bf4f76dec3a\``,
    );
    await queryRunner.query(`DROP TABLE \`calendar_company\``);
  }
}
