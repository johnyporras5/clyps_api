import { MigrationInterface, QueryRunner } from "typeorm";

export class AddFieldsSessionDetaild1769715154612 implements MigrationInterface {
    name = 'AddFieldsSessionDetaild1769715154612'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`session_detail\` ADD \`description_worker\` text NULL`);
        await queryRunner.query(`ALTER TABLE \`session_detail\` ADD \`description_ia\` text NULL`);
        await queryRunner.query(`ALTER TABLE \`session_detail\` ADD \`description\` text NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`session_detail\` DROP COLUMN \`description\``);
        await queryRunner.query(`ALTER TABLE \`session_detail\` DROP COLUMN \`description_ia\``);
        await queryRunner.query(`ALTER TABLE \`session_detail\` DROP COLUMN \`description_worker\``);
    }

}
