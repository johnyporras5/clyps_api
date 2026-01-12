import { MigrationInterface, QueryRunner } from "typeorm";

export class AddLocationWorker1768242036097 implements MigrationInterface {
    name = 'AddLocationWorker1768242036097'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`worker\` ADD \`location\` varchar(145) NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`worker\` DROP COLUMN \`location\``);
    }

}
