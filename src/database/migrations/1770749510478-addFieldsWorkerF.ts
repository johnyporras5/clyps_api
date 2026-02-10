import { MigrationInterface, QueryRunner } from "typeorm";

export class AddFieldsWorkerF1770749510478 implements MigrationInterface {
    name = 'AddFieldsWorkerF1770749510478'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`worker_feedback\` ADD \`workerId\` int NULL`);
        await queryRunner.query(`ALTER TABLE \`worker_feedback\` CHANGE \`datetime\` \`datetime\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)`);
        await queryRunner.query(`ALTER TABLE \`worker_feedback\` CHANGE \`id\` \`id\` int NOT NULL`);
        await queryRunner.query(`ALTER TABLE \`worker_feedback\` DROP PRIMARY KEY`);
        await queryRunner.query(`ALTER TABLE \`worker_feedback\` ADD PRIMARY KEY (\`id\`)`);
        await queryRunner.query(`ALTER TABLE \`worker_feedback\` CHANGE \`id\` \`id\` int NOT NULL AUTO_INCREMENT`);
        await queryRunner.query(`ALTER TABLE \`session\` CHANGE \`total_cost\` \`total_cost\` decimal(10,2) NULL`);
        await queryRunner.query(`ALTER TABLE \`service\` CHANGE \`status\` \`status\` int NULL DEFAULT '1'`);
        await queryRunner.query(`ALTER TABLE \`worker_feedback\` ADD CONSTRAINT \`FK_7a6d163348edf89f3adb0aa48c5\` FOREIGN KEY (\`workerId\`) REFERENCES \`worker\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`worker_feedback\` DROP FOREIGN KEY \`FK_7a6d163348edf89f3adb0aa48c5\``);
        await queryRunner.query(`ALTER TABLE \`service\` CHANGE \`status\` \`status\` int NULL`);
        await queryRunner.query(`ALTER TABLE \`session\` CHANGE \`total_cost\` \`total_cost\` decimal(10,4) NULL`);
        await queryRunner.query(`ALTER TABLE \`worker_feedback\` CHANGE \`id\` \`id\` int NOT NULL`);
        await queryRunner.query(`ALTER TABLE \`worker_feedback\` DROP PRIMARY KEY`);
        await queryRunner.query(`ALTER TABLE \`worker_feedback\` ADD PRIMARY KEY (\`id\`, \`worker_id\`)`);
        await queryRunner.query(`ALTER TABLE \`worker_feedback\` CHANGE \`id\` \`id\` int NOT NULL AUTO_INCREMENT`);
        await queryRunner.query(`ALTER TABLE \`worker_feedback\` CHANGE \`datetime\` \`datetime\` datetime(0) NULL`);
        await queryRunner.query(`ALTER TABLE \`worker_feedback\` DROP COLUMN \`workerId\``);
    }

}
