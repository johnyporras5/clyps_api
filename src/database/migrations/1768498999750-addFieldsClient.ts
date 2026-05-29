import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFieldsClient1768498999750 implements MigrationInterface {
  name = 'AddFieldsClient1768498999750';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`client\` ADD \`is_active\` tinyint NOT NULL DEFAULT '1'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`client\` ADD \`companies\` json NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`client\` ADD \`is_public\` tinyint NOT NULL DEFAULT '0'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`service\` CHANGE \`id\` \`id\` int NOT NULL`,
    );
    await queryRunner.query(`ALTER TABLE \`service\` DROP PRIMARY KEY`);
    await queryRunner.query(`ALTER TABLE \`service\` ADD PRIMARY KEY (\`id\`)`);
    await queryRunner.query(
      `ALTER TABLE \`service\` CHANGE \`id\` \`id\` int NOT NULL AUTO_INCREMENT`,
    );
    await queryRunner.query(
      `ALTER TABLE \`company_worker\` ADD CONSTRAINT \`FK_a5123813e7bff7f219db1a30d9d\` FOREIGN KEY (\`worker_id\`) REFERENCES \`worker\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`company_worker\` DROP FOREIGN KEY \`FK_a5123813e7bff7f219db1a30d9d\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`service\` CHANGE \`id\` \`id\` int NOT NULL`,
    );
    await queryRunner.query(`ALTER TABLE \`service\` DROP PRIMARY KEY`);
    await queryRunner.query(
      `ALTER TABLE \`service\` ADD PRIMARY KEY (\`id\`, \`company_id\`)`,
    );
    await queryRunner.query(
      `ALTER TABLE \`service\` CHANGE \`id\` \`id\` int NOT NULL AUTO_INCREMENT`,
    );
    await queryRunner.query(`ALTER TABLE \`client\` DROP COLUMN \`is_public\``);
    await queryRunner.query(`ALTER TABLE \`client\` DROP COLUMN \`companies\``);
    await queryRunner.query(`ALTER TABLE \`client\` DROP COLUMN \`is_active\``);
  }
}
