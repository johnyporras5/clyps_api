import { MigrationInterface, QueryRunner } from "typeorm";

export class AddColumnsClient1767638984497 implements MigrationInterface {
    name = 'AddColumnsClient1767638984497'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX \`IDX_f18a6fabea7b2a90ab6bf10a65\` ON \`client\``);
        await queryRunner.query(`ALTER TABLE \`client\` ADD \`phone_number\` varchar(20) NULL`);
        await queryRunner.query(`ALTER TABLE \`client\` ADD \`birth_date\` date NULL`);
        await queryRunner.query(`ALTER TABLE \`client\` ADD \`picture\` varchar(500) NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`client\` DROP COLUMN \`picture\``);
        await queryRunner.query(`ALTER TABLE \`client\` DROP COLUMN \`birth_date\``);
        await queryRunner.query(`ALTER TABLE \`client\` DROP COLUMN \`phone_number\``);
        await queryRunner.query(`CREATE UNIQUE INDEX \`IDX_f18a6fabea7b2a90ab6bf10a65\` ON \`client\` (\`user_id\`)`);
    }

}
