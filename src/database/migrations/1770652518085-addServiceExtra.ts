import { MigrationInterface, QueryRunner } from "typeorm";

export class AddServiceExtra1770652518085 implements MigrationInterface {
    name = 'AddServiceExtra1770652518085'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`session\` ADD \`extra_services\` json NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`session\` DROP COLUMN \`extra_services\``);
    }

}
