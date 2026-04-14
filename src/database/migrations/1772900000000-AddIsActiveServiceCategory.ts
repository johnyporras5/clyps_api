import { MigrationInterface, QueryRunner } from "typeorm";

export class AddIsActiveServiceCategory1772900000000 implements MigrationInterface {
    name = 'AddIsActiveServiceCategory1772900000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`service_category\` ADD \`is_active\` tinyint NOT NULL DEFAULT 1`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`service_category\` DROP COLUMN \`is_active\``);
    }
}
