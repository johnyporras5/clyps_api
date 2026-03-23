import { MigrationInterface, QueryRunner } from "typeorm";

export class AddFieldCategoryService1774291540241 implements MigrationInterface {
    name = 'AddFieldCategoryService1774291540241'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`service_category\` ADD \`description\` text NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`service_category\` DROP COLUMN \`description\``);
    }

}
