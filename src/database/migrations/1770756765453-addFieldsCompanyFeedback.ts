import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFieldsWorkerCompany1770756765453 implements MigrationInterface {
  name = 'AddFieldsWorkerCompany1770756765453';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`company_feedback\` ADD \`description\` text NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`company_feedback\` DROP COLUMN \`datetime\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`company_feedback\` ADD \`datetime\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)`,
    );
    await queryRunner.query(
      `ALTER TABLE \`company_feedback\` CHANGE \`id\` \`id\` int NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`company_feedback\` DROP PRIMARY KEY`,
    );
    await queryRunner.query(
      `ALTER TABLE \`company_feedback\` ADD PRIMARY KEY (\`id\`)`,
    );
    await queryRunner.query(
      `ALTER TABLE \`company_feedback\` CHANGE \`id\` \`id\` int NOT NULL AUTO_INCREMENT`,
    );
    await queryRunner.query(
      `ALTER TABLE \`company_feedback\` ADD CONSTRAINT \`FK_c1e47c5df403363ffb319d232a0\` FOREIGN KEY (\`company_id\`) REFERENCES \`company\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`company_feedback\` DROP FOREIGN KEY \`FK_c1e47c5df403363ffb319d232a0\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`company_feedback\` CHANGE \`id\` \`id\` int NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`company_feedback\` DROP PRIMARY KEY`,
    );
    await queryRunner.query(
      `ALTER TABLE \`company_feedback\` ADD PRIMARY KEY (\`id\`, \`company_id\`)`,
    );
    await queryRunner.query(
      `ALTER TABLE \`company_feedback\` CHANGE \`id\` \`id\` int NOT NULL AUTO_INCREMENT`,
    );
    await queryRunner.query(
      `ALTER TABLE \`company_feedback\` DROP COLUMN \`datetime\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`company_feedback\` ADD \`datetime\` datetime(0) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`company_feedback\` DROP COLUMN \`description\``,
    );
  }
}
