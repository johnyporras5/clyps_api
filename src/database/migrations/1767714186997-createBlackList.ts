import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateBlackList1767714186997 implements MigrationInterface {
    name = 'CreateBlackList1767714186997'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE \`blacklisted_tokens\` (\`id\` int NOT NULL AUTO_INCREMENT, \`token\` text NOT NULL, \`expiresAt\` bigint NOT NULL, \`userId\` int NULL, \`reason\` varchar(255) NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`clearedAt\` datetime NULL, INDEX \`IDX_7e6c16a1c0e40ea23436409d07\` (\`clearedAt\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX \`IDX_7e6c16a1c0e40ea23436409d07\` ON \`blacklisted_tokens\``);
        await queryRunner.query(`DROP TABLE \`blacklisted_tokens\``);
    }

}
