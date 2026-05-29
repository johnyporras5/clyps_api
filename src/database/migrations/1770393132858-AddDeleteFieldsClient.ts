import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDeleteFieldsClient1770393132858 implements MigrationInterface {
  name = 'AddDeleteFieldsClient1770393132858';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`client\` ADD \`temporarily_deleted\` tinyint NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE \`client\` ADD \`permanently_deleted\` tinyint NOT NULL DEFAULT 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`client\` DROP COLUMN \`permanently_deleted\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`client\` DROP COLUMN \`temporarily_deleted\``,
    );
  }
}
