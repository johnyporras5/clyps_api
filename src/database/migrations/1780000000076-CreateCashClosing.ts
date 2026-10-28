import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCashClosing1780000000076 implements MigrationInterface {
  name = 'CreateCashClosing1780000000076';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`cash_closing\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`company_id\` int NOT NULL,
        \`date\` date NOT NULL,
        \`version\` int NOT NULL,
        \`status\` varchar(10) NOT NULL,
        \`opening_cash\` json NOT NULL,
        \`closing_lines\` json NOT NULL,
        \`retained_cash\` json NOT NULL,
        \`has_difference\` tinyint NOT NULL DEFAULT 0,
        \`notes\` varchar(500) NULL,
        \`closed_by_user_id\` int NOT NULL,
        \`closed_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`reverted_by_user_id\` int NULL,
        \`reverted_at\` datetime NULL,
        \`revert_reason\` varchar(255) NULL,
        \`active_date\` date
          GENERATED ALWAYS AS (IF(\`status\` = 'closed', \`date\`, NULL)) STORED,
        PRIMARY KEY (\`id\`),
        KEY \`IDX_cash_closing_company_date\` (\`company_id\`, \`date\`),
        UNIQUE KEY \`UQ_cash_closing_company_version\` (\`company_id\`, \`date\`, \`version\`),
        UNIQUE KEY \`UQ_cash_closing_company_active\` (\`company_id\`, \`active_date\`),
        CONSTRAINT \`CHK_cash_closing_status\`
          CHECK (\`status\` IN ('closed','reverted'))
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE \`cash_closing\``);
  }
}
