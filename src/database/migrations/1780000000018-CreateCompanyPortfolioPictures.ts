import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCompanyPortfolioPictures1780000000018 implements MigrationInterface {
  name = 'CreateCompanyPortfolioPictures1780000000018';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`company_portfolio_pictures\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`picture\` varchar(145) NULL,
        \`company_id\` int NOT NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        INDEX \`IDX_company_portfolio_company_id\` (\`company_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `company_portfolio_pictures`');
  }
}
