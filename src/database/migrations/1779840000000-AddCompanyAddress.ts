import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCompanyAddress1779840000000 implements MigrationInterface {
    name = 'AddCompanyAddress1779840000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`company\` ADD \`address\` varchar(255) NULL`);
        await queryRunner.query(`ALTER TABLE \`company\` MODIFY \`location\` varchar(255) NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`company\` MODIFY \`location\` varchar(145) NULL`);
        await queryRunner.query(`ALTER TABLE \`company\` DROP COLUMN \`address\``);
    }

}
