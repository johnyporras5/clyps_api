import { MigrationInterface, QueryRunner } from "typeorm";

export class AddFieldsServices1768316612878 implements MigrationInterface {
    name = 'AddFieldsServices1768316612878'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`service\` ADD \`workers\` json NULL`);
        await queryRunner.query(`ALTER TABLE \`service\` ADD \`currency\` varchar(10) NULL DEFAULT 'VES'`);
        await queryRunner.query(`ALTER TABLE \`service\` ADD \`description\` text NULL`);
        await queryRunner.query(`ALTER TABLE \`service\` ADD \`percentage\` decimal NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`service\` DROP COLUMN \`percentage\``);
        await queryRunner.query(`ALTER TABLE \`service\` DROP COLUMN \`description\``);
        await queryRunner.query(`ALTER TABLE \`service\` DROP COLUMN \`currency\``);
        await queryRunner.query(`ALTER TABLE \`service\` DROP COLUMN \`workers\``);
    }

}
