import { MigrationInterface, QueryRunner } from "typeorm";

export class AddFieldsCompanyWorker1770391737803 implements MigrationInterface {
    name = 'AddFieldsCompanyWorker1770391737803'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`company_worker\` ADD \`temporarily_deleted\` tinyint NOT NULL DEFAULT 0`);
        await queryRunner.query(`ALTER TABLE \`company_worker\` ADD \`permanently_deleted\` tinyint NOT NULL DEFAULT 0`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`company_worker\` DROP COLUMN \`permanently_deleted\``);
        await queryRunner.query(`ALTER TABLE \`company_worker\` DROP COLUMN \`temporarily_deleted\``);
    }

}
