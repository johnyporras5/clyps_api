import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddColumnCalendar1767889469560 implements MigrationInterface {
  name = 'AddColumnCalendar1767889469560';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`company_worker\` ADD \`calendar\` json NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`company_worker\` DROP COLUMN \`calendar\``,
    );
  }
}
