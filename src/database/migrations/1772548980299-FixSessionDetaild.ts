import { MigrationInterface, QueryRunner } from "typeorm";

export class FixSessionDetaild1772548980299 implements MigrationInterface {
    name = 'FixSessionDetaild1772548980299'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`session\` DROP COLUMN \`description_ia\``);
        await queryRunner.query(`ALTER TABLE \`session\` DROP COLUMN \`description\``);
        await queryRunner.query(`ALTER TABLE \`session_detail\` ADD \`description_ia\` text NULL`);
        await queryRunner.query(`ALTER TABLE \`session_detail\` ADD \`description\` text NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`session_detail\` DROP COLUMN \`description\``);
        await queryRunner.query(`ALTER TABLE \`session_detail\` DROP COLUMN \`description_ia\``);
        await queryRunner.query(`ALTER TABLE \`session\` ADD \`description\` text NULL`);
        await queryRunner.query(`ALTER TABLE \`session\` ADD \`description_ia\` text NULL`);
    }

}
