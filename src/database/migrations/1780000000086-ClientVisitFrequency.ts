import { MigrationInterface, QueryRunner } from 'typeorm';

export class ClientVisitFrequency1780000000086 implements MigrationInterface {
  name = 'ClientVisitFrequency1780000000086';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`client\` ADD \`company_visit_frequencies\` json NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`client\` DROP COLUMN \`company_visit_frequencies\``,
    );
  }
}
