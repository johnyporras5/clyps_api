import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAttemptsVerificationCodes1780000000011
  implements MigrationInterface
{
  name = 'AddAttemptsVerificationCodes1780000000011';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`user_verification_codes\` ADD \`attempts\` int NOT NULL DEFAULT 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`user_verification_codes\` DROP COLUMN \`attempts\``,
    );
  }
}
