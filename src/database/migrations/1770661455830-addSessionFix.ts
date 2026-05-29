import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSessionFix1770661455830 implements MigrationInterface {
  name = 'AddSessionFix1770661455830';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`session_detail\` DROP COLUMN \`metadata\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`session_detail\` ADD \`is_extra\` tinyint NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE \`session_detail\` ADD \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`session_detail\` DROP COLUMN \`created_at\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`session_detail\` DROP COLUMN \`is_extra\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`session_detail\` ADD \`metadata\` json NULL`,
    );
  }
}
