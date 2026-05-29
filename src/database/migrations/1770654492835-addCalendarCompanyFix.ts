import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCalendarCompanyFix1770654492835 implements MigrationInterface {
  name = 'AddCalendarCompanyFix1770654492835';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`session_detail\` ADD \`metadata\` json NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`session_detail\` DROP COLUMN \`metadata\``,
    );
  }
}
