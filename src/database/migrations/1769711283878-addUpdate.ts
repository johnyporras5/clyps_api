import { MigrationInterface, QueryRunner } from "typeorm";

export class AddUpdate1769711283878 implements MigrationInterface {
    name = 'AddUpdate1769711283878'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`session_detail\` ADD \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)`);
        await queryRunner.query(`ALTER TABLE \`session\` ADD \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`session\` DROP COLUMN \`updated_at\``);
        await queryRunner.query(`ALTER TABLE \`session_detail\` DROP COLUMN \`updated_at\``);
    }

}
