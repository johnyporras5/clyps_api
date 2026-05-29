import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDescriptionSession1777000000000 implements MigrationInterface {
  name = 'AddDescriptionSession1777000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`session\` ADD \`description\` text NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`session\` ADD \`description_ia\` text NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`session\` DROP COLUMN \`description_ia\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`session\` DROP COLUMN \`description\``,
    );
  }
}
