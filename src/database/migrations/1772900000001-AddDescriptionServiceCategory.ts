import { MigrationInterface, QueryRunner } from "typeorm";

export class AddDescriptionServiceCategory1772900000001 implements MigrationInterface {
    name = 'AddDescriptionServiceCategory1772900000001'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`service_category\` ADD \`description\` text NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`service_category\` DROP COLUMN \`description\``);
    }
}
