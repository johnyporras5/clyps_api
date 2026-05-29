import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixSession1769702568929 implements MigrationInterface {
  name = 'FixSession1769702568929';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`session\` CHANGE \`id\` \`id\` int NOT NULL`,
    );
    await queryRunner.query(`ALTER TABLE \`session\` DROP PRIMARY KEY`);
    await queryRunner.query(`ALTER TABLE \`session\` ADD PRIMARY KEY (\`id\`)`);
    await queryRunner.query(
      `ALTER TABLE \`session\` CHANGE \`id\` \`id\` int NOT NULL AUTO_INCREMENT`,
    );
    await queryRunner.query(
      `ALTER TABLE \`company_worker\` ADD CONSTRAINT \`FK_bbae9589657d49887666cd8ce15\` FOREIGN KEY (\`company_id\`) REFERENCES \`company\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`company_worker\` DROP FOREIGN KEY \`FK_bbae9589657d49887666cd8ce15\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`session\` CHANGE \`id\` \`id\` int NOT NULL`,
    );
    await queryRunner.query(`ALTER TABLE \`session\` DROP PRIMARY KEY`);
    await queryRunner.query(
      `ALTER TABLE \`session\` ADD PRIMARY KEY (\`client_id\`, \`id\`)`,
    );
    await queryRunner.query(
      `ALTER TABLE \`session\` CHANGE \`id\` \`id\` int NOT NULL AUTO_INCREMENT`,
    );
  }
}
