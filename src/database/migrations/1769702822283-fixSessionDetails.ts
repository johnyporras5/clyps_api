import { MigrationInterface, QueryRunner } from "typeorm";

export class FixSessionDetails1769702822283 implements MigrationInterface {
    name = 'FixSessionDetails1769702822283'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`session_detail\` DROP PRIMARY KEY`);
        await queryRunner.query(`ALTER TABLE \`session_detail\` ADD PRIMARY KEY (\`id\`, \`service_id\`, \`company_worker_id\`, \`session_id\`)`);
        await queryRunner.query(`ALTER TABLE \`session_detail\` CHANGE \`id\` \`id\` int NOT NULL AUTO_INCREMENT`);
        await queryRunner.query(`ALTER TABLE \`session\` CHANGE \`id\` \`id\` int NOT NULL`);
        await queryRunner.query(`ALTER TABLE \`session\` DROP PRIMARY KEY`);
        await queryRunner.query(`ALTER TABLE \`session\` ADD PRIMARY KEY (\`id\`, \`client_id\`)`);
        await queryRunner.query(`ALTER TABLE \`session\` CHANGE \`id\` \`id\` int NOT NULL AUTO_INCREMENT`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`session\` CHANGE \`id\` \`id\` int NOT NULL`);
        await queryRunner.query(`ALTER TABLE \`session\` DROP PRIMARY KEY`);
        await queryRunner.query(`ALTER TABLE \`session\` ADD PRIMARY KEY (\`id\`)`);
        await queryRunner.query(`ALTER TABLE \`session\` CHANGE \`id\` \`id\` int NOT NULL AUTO_INCREMENT`);
        await queryRunner.query(`ALTER TABLE \`session_detail\` CHANGE \`id\` \`id\` int NOT NULL`);
        await queryRunner.query(`ALTER TABLE \`session_detail\` DROP PRIMARY KEY`);
        await queryRunner.query(`ALTER TABLE \`session_detail\` ADD PRIMARY KEY (\`company_worker_id\`, \`id\`, \`session_id\`)`);
    }

}
