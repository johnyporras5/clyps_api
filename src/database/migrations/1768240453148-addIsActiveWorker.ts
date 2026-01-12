import { MigrationInterface, QueryRunner } from "typeorm";

export class AddIsActiveWorker1768240453148 implements MigrationInterface {
    name = 'AddIsActiveWorker1768240453148'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`worker\` ADD \`is_active\` tinyint NOT NULL DEFAULT '1'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`worker\` DROP COLUMN \`is_active\``);
    }

}
