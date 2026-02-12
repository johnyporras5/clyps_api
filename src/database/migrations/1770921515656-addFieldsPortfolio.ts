import { MigrationInterface, QueryRunner } from "typeorm";

export class AddFieldsPortfolio1770921515656 implements MigrationInterface {
    name = 'AddFieldsPortfolio1770921515656'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`portfolio_pictures\` ADD \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)`);
        await queryRunner.query(`ALTER TABLE \`portfolio_pictures\` ADD \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`portfolio_pictures\` DROP COLUMN \`updated_at\``);
        await queryRunner.query(`ALTER TABLE \`portfolio_pictures\` DROP COLUMN \`created_at\``);
    }

}
