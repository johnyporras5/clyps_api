import { MigrationInterface, QueryRunner } from "typeorm";

export class AddFieldsCompany1769545554943 implements MigrationInterface {
    name = 'AddFieldsCompany1769545554943'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`company\` ADD \`manager_name\` varchar(145) NULL`);
        await queryRunner.query(`ALTER TABLE \`company\` ADD \`instagram_url\` varchar(245) NULL`);
        await queryRunner.query(`ALTER TABLE \`company\` ADD \`tiktok_url\` varchar(245) NULL`);
        await queryRunner.query(`ALTER TABLE \`company\` ADD \`facebook_url\` varchar(245) NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`company\` DROP COLUMN \`facebook_url\``);
        await queryRunner.query(`ALTER TABLE \`company\` DROP COLUMN \`tiktok_url\``);
        await queryRunner.query(`ALTER TABLE \`company\` DROP COLUMN \`instagram_url\``);
        await queryRunner.query(`ALTER TABLE \`company\` DROP COLUMN \`manager_name\``);
    }

}
