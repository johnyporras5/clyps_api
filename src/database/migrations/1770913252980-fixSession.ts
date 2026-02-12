import { MigrationInterface, QueryRunner } from "typeorm";

export class FixSession1770913252980 implements MigrationInterface {
    name = 'FixSession1770913252980'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`session\` CHANGE \`id\` \`id\` int NOT NULL`);
        await queryRunner.query(`ALTER TABLE \`session\` DROP PRIMARY KEY`);
        await queryRunner.query(`ALTER TABLE \`session\` ADD PRIMARY KEY (\`id\`)`);
        await queryRunner.query(`ALTER TABLE \`session\` CHANGE \`id\` \`id\` int NOT NULL AUTO_INCREMENT`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`session\` CHANGE \`id\` \`id\` int NOT NULL`);
        await queryRunner.query(`ALTER TABLE \`session\` DROP PRIMARY KEY`);
        await queryRunner.query(`ALTER TABLE \`session\` ADD PRIMARY KEY (\`client_id\`, \`id\`)`);
        await queryRunner.query(`ALTER TABLE \`session\` CHANGE \`id\` \`id\` int NOT NULL AUTO_INCREMENT`);
    }

}
