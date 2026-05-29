import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVerification1767644980829 implements MigrationInterface {
  name = 'AddVerification1767644980829';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`user_verification_codes\` (\`id\` int NOT NULL AUTO_INCREMENT, \`user_id\` int NOT NULL, \`code\` varchar(6) NOT NULL, \`expires_at\` datetime NOT NULL, \`used\` tinyint NOT NULL DEFAULT '0', \`code_type\` varchar(50) NOT NULL DEFAULT 'email_verification', \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`user\` DROP COLUMN \`email_verified\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`user\` ADD \`email_verified\` tinyint NOT NULL DEFAULT '0'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`user_verification_codes\` ADD CONSTRAINT \`FK_b75324c1b0a81ae2635d727cf07\` FOREIGN KEY (\`user_id\`) REFERENCES \`user\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`user_verification_codes\` DROP FOREIGN KEY \`FK_b75324c1b0a81ae2635d727cf07\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`user\` DROP COLUMN \`email_verified\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`user\` ADD \`email_verified\` int NOT NULL DEFAULT '0'`,
    );
    await queryRunner.query(`DROP TABLE \`user_verification_codes\``);
  }
}
