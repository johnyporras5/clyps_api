import { MigrationInterface, QueryRunner } from "typeorm";

export class AddFieldsOfferId1772726961804 implements MigrationInterface {
    name = 'AddFieldsOfferId1772726961804'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`session\` DROP COLUMN \`offer_id\``);
        await queryRunner.query(`ALTER TABLE \`session_detail\` ADD \`offer_id\` int NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`session_detail\` DROP COLUMN \`offer_id\``);
        await queryRunner.query(`ALTER TABLE \`session\` ADD \`offer_id\` int NULL`);
    }

}
