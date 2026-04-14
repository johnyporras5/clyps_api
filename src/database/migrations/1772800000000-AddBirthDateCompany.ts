import { MigrationInterface, QueryRunner } from "typeorm";

export class AddBirthDateCompany1772800000000 implements MigrationInterface {
    name = 'AddBirthDateCompany1772800000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`company\` ADD \`birth_date\` date NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`company\` DROP COLUMN \`birth_date\``);
    }

}
