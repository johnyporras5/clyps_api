import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddClientFavoriteCompany1776124800000 implements MigrationInterface {
  name = 'AddClientFavoriteCompany1776124800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE \`client_favorite_company\` (
                \`id\` int NOT NULL AUTO_INCREMENT,
                \`client_id\` int NOT NULL,
                \`company_id\` int NOT NULL,
                \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE INDEX \`UQ_client_favorite_company_client_company\` (\`client_id\`, \`company_id\`),
                INDEX \`IDX_client_favorite_company_client\` (\`client_id\`),
                INDEX \`IDX_client_favorite_company_company\` (\`company_id\`),
                PRIMARY KEY (\`id\`)
            ) ENGINE=InnoDB
        `);

    await queryRunner.query(`
            ALTER TABLE \`client_favorite_company\`
            ADD CONSTRAINT \`FK_client_favorite_company_client\`
            FOREIGN KEY (\`client_id\`) REFERENCES \`client\`(\`id\`)
            ON DELETE CASCADE ON UPDATE NO ACTION
        `);

    await queryRunner.query(`
            ALTER TABLE \`client_favorite_company\`
            ADD CONSTRAINT \`FK_client_favorite_company_company\`
            FOREIGN KEY (\`company_id\`) REFERENCES \`company\`(\`id\`)
            ON DELETE CASCADE ON UPDATE NO ACTION
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`client_favorite_company\` DROP FOREIGN KEY \`FK_client_favorite_company_company\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`client_favorite_company\` DROP FOREIGN KEY \`FK_client_favorite_company_client\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_client_favorite_company_company\` ON \`client_favorite_company\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_client_favorite_company_client\` ON \`client_favorite_company\``,
    );
    await queryRunner.query(
      `DROP INDEX \`UQ_client_favorite_company_client_company\` ON \`client_favorite_company\``,
    );
    await queryRunner.query(`DROP TABLE \`client_favorite_company\``);
  }
}
